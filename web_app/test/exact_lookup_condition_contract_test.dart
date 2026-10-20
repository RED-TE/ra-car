import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/models/quote.dart';
import 'package:recar_app/models/quote_selection.dart';
import 'package:recar_app/services/api_client.dart';
import 'package:recar_app/services/quote_api.dart';
import 'package:recar_app/services/vehicle_cache.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> _copyMap(Map value) =>
    jsonDecode(jsonEncode(value)) as Map<String, dynamic>;

/// SYNTHETIC CONTRACT FIXTURE, not a production quote or a price assertion.
/// Reuse an existing exact response's schema without duplicating its private
/// calculation fields. Only public request/selection/provenance fields change.
Map<String, dynamic> _syntheticExactLookup({
  String product = 'RENTAL',
  int prepaymentPct = 20,
  bool amountRequest = false,
}) {
  // Chrome receives the exact same recorded JSON through a test-only define.
  // prepare-app-web writes it outside build/web; it must never become a
  // production asset or a new public fixture containing financial internals.
  const inlineFixture = String.fromEnvironment('EXACT_LOOKUP_FIXTURE_BASE64');
  if (kIsWeb && inlineFixture.isEmpty) {
    throw StateError(
      'Chrome requires --dart-define-from-file=../test-fixture-defines.json',
    );
  }
  final catalog =
      jsonDecode(
            inlineFixture.isNotEmpty
                ? utf8.decode(base64Decode(inlineFixture))
                : File(
                    'test/fixtures/new3_catalog_20261015.json',
                  ).readAsStringSync(),
          )
          as Map<String, dynamic>;
  final row = _copyMap((catalog['quotes'] as List).first as Map);
  final data = row['response']['data'] as Map<String, dynamic>;
  final request = row['request'] as Map<String, dynamic>;
  final deposit =
      (data['selected_vehicle_price'] as int) * prepaymentPct ~/ 100;
  request
    ..['product_type'] = product
    ..['term'] = 60
    ..['mileage_limit'] = 10000
    ..['guarantee'] = 0
    ..['prepayment_pct'] = prepaymentPct;
  request.remove('deposit');
  if (amountRequest) {
    request.remove('prepayment_pct');
    request['deposit'] = deposit;
  }
  data
    ..['term'] = 60
    ..['mileage_limit'] = 10000
    ..['deposit'] = deposit
    ..['prepayment_pct'] = prepaymentPct
    ..['guarantee'] = 0
    ..['guarantee_pct'] = 0
    ..['price_source'] = 'VEHICLE_QUOTE_LOOKUP';
  final proof = data['price_provenance'] as Map<String, dynamic>;
  proof
    ..['processed_product_type'] = product
    ..['request_conditions_verified'] = true
    ..['sales_ai_eligible'] = prepaymentPct == 0
    ..['unsupported_reasons'] = [
      if (prepaymentPct != 0) 'NONZERO_PREPAYMENT_OUT_OF_INITIAL_SCOPE',
    ];
  final conditions = <String, dynamic>{
    'term_months': 60,
    'annual_km': 10000,
    'prepayment_pct': prepaymentPct,
  };
  proof['market_price'] = {
    'source': 'VEHICLE_QUOTE_LOOKUP',
    'source_record_id': 'synthetic-lookup-not-production',
    'source_revision': 'synthetic-revision-not-production',
    'product_type': product,
    'match_status': 'EXACT',
    'calculation_method': 'DATABASE_ORDERED_LOOKUP',
    'methods': ['TERM_PREPAYMENT_MILEAGE_EXACT_SELECTION'],
    'vehicle_match': 'EXACT',
    'applied_conditions': conditions,
    'condition_match': {
      'term_months': 'EXACT',
      'annual_km': 'EXACT',
      'prepayment_pct': 'EXACT',
    },
    'source_points': [
      {
        'path': 'vehicle_quote_lookup',
        'role': 'BASE',
        'conditions': {...conditions},
      },
    ],
    'unknown_reasons': <String>[],
  };
  return row;
}

Future<QuoteEnvelope> _request(Map<String, dynamic> row) async {
  final request = row['request'] as Map<String, dynamic>;
  final interceptor = InterceptorsWrapper(
    onRequest: (options, handler) {
      handler.resolve(
        Response(
          requestOptions: options,
          statusCode: 200,
          data: row['response'],
        ),
      );
    },
  );
  ApiClient.dio.interceptors.add(interceptor);
  try {
    return await QuoteApi.createInstantQuote(
      vehicleId: request['vehicle_id'] as String,
      selection: QuoteSelection.fromJson(
        Map<String, dynamic>.from(request['selection'] as Map),
      ),
      productType: request['product_type'] as String,
      term: request['term'] as int,
      mileageLimit: request['mileage_limit'] as int,
      deposit: request['deposit'] as int? ?? 0,
      guarantee: request['guarantee'] as int? ?? 0,
      prepaymentPct: request['prepayment_pct'] as int?,
      guaranteePct: request['guarantee_pct'] as int?,
    );
  } finally {
    ApiClient.dio.interceptors.remove(interceptor);
  }
}

Future<QuoteEnvelope> _requestWithDeclaredDefault(
  Map<String, dynamic> row, {
  required List<Map<String, dynamic>> posted,
  bool declared = true,
  bool active = true,
  bool activeLeaf = false,
  bool wrongVehicle = false,
}) async {
  final request = row['request'] as Map<String, dynamic>;
  final trimId = request['selection']['vehicle_trim_id'] as String;
  final detail = <String, dynamic>{
    'id': wrongVehicle ? 'synthetic-unrelated-vehicle' : request['vehicle_id'],
    'brand': 'SYNTHETIC',
    'model_name': 'SYNTHETIC DEFAULT RESOLUTION',
    'segment': 'SYNTHETIC',
    'fuel': 'gasoline',
    'year': 2026,
    'base_price': row['response']['data']['selected_vehicle_price'],
    if (declared && !activeLeaf) 'default_vehicle_trim_id': trimId,
    'trims': [
      {
        'id': 'synthetic-first-trim-not-default',
        'name': 'Not the default',
        'price': 1,
        'options': [],
      },
      if (!activeLeaf)
        {
          'id': trimId,
          'name': 'Server declared default',
          'price': row['response']['data']['selected_vehicle_price'],
          'is_available': active,
          'options': [],
        },
    ],
    if (activeLeaf)
      'trim_selection': {
        'mode': 'FLAT',
        if (declared) 'default_vehicle_trim_id': trimId,
        'flat_grades': [
          {
            'vehicle_trim_id': trimId,
            'name': 'Declared leaf',
            'is_active': active,
          },
        ],
      },
  };
  final interceptor = InterceptorsWrapper(
    onRequest: (options, handler) {
      Object? response;
      if (options.path == '/api/v1/vehicles/${request['vehicle_id']}') {
        response = detail;
      } else if (options.method == 'POST' &&
          options.path == '/api/v1/quotes/instant') {
        posted.add(Map<String, dynamic>.from(options.data as Map));
        response = row['response'];
      }
      // Catalog-version checks are intercepted too; no request can escape.
      handler.resolve(
        Response(
          requestOptions: options,
          statusCode: response == null ? 404 : 200,
          data:
              response ??
              {
                'error': {'code': 'SYNTHETIC_NOT_FOUND'},
              },
        ),
      );
    },
  );
  ApiClient.dio.interceptors.add(interceptor);
  try {
    return await QuoteApi.createInstantQuote(
      vehicleId: request['vehicle_id'] as String,
      productType: request['product_type'] as String,
      term: request['term'] as int,
      mileageLimit: request['mileage_limit'] as int,
      prepaymentPct: request['prepayment_pct'] as int,
    );
  } finally {
    ApiClient.dio.interceptors.remove(interceptor);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    VehicleCache.invalidateAll();
  });

  for (final activeLeaf in [false, true]) {
    test(
      'legacy caller uses only declared ${activeLeaf ? 'active leaf' : 'available trim'}, never first trim',
      () async {
        final row = _syntheticExactLookup();
        final posted = <Map<String, dynamic>>[];
        final quote = await _requestWithDeclaredDefault(
          row,
          posted: posted,
          activeLeaf: activeLeaf,
        );
        expect(posted, hasLength(1));
        expect(posted.single['selection_contract_version'], 'selection_v1');
        expect(posted.single['selection'], row['request']['selection']);
        expect(
          quote.data.monthlyPayment,
          row['response']['data']['monthly_payment'],
        );
      },
    );
  }

  for (final failure in ['undeclared', 'inactive', 'wrong vehicle']) {
    test('legacy caller blocks $failure default before quote POST', () async {
      final posted = <Map<String, dynamic>>[];
      await expectLater(
        _requestWithDeclaredDefault(
          _syntheticExactLookup(),
          posted: posted,
          declared: failure != 'undeclared',
          active: failure != 'inactive',
          wrongVehicle: failure == 'wrong vehicle',
        ),
        throwsA(isA<QuoteConditionsUnverified>()),
      );
      expect(posted, isEmpty);
    });
  }

  for (final product in ['RENTAL', 'LEASE']) {
    for (final amountRequest in [false, true]) {
      test(
        'synthetic exact DB $product 20% ${amountRequest ? 'KRW' : '%'} '
        'preserves server monthly despite initial Sales AI ineligibility',
        () async {
          final row = _syntheticExactLookup(
            product: product,
            amountRequest: amountRequest,
          );
          final data = row['response']['data'] as Map<String, dynamic>;
          expect(data['price_provenance']['sales_ai_eligible'], isFalse);
          final quote = await _request(row);
          expect(quote.data.monthlyPayment, data['monthly_payment']);
          expect(quote.data.prepaymentPct, 20);
          expect(quote.data.deposit, data['deposit']);
          expect(quote.data.guarantee, 0);
          expect(quote.data.hasSelectionPricingProof, isTrue);
        },
      );
    }
  }

  test(
    'synthetic exact DB zero-prepay remains in the strict initial scope',
    () async {
      final row = _syntheticExactLookup(prepaymentPct: 0);
      expect(
        (await _request(row)).data.monthlyPayment,
        row['response']['data']['monthly_payment'],
      );
      row['response']['data']['price_provenance']['sales_ai_eligible'] = false;
      await expectLater(
        _request(row),
        throwsA(isA<QuoteConditionsUnverified>()),
      );
    },
  );

  test('numeric 20.0 response matches an integer percent request', () async {
    final row = _syntheticExactLookup();
    row['response']['data']['prepayment_pct'] = 20.0;
    row['response']['data']['price_provenance']['market_price']['applied_conditions']['prepayment_pct'] =
        20.0;
    expect((await _request(row)).data.prepaymentPct, 20);
  });

  final invalidResponses = <String, void Function(Map<String, dynamic>)>{
    'wrong vehicle': (d) => d['vehicle_id'] = 'another-vehicle',
    'wrong trim': (d) => d['vehicle_trim_id'] = 'another-trim',
    'wrong normalized option': (d) =>
        d['normalized_selection']['selected_option_ids'] = ['another-option'],
    'wrong term': (d) => d['term'] = 48,
    'wrong mileage': (d) => d['mileage_limit'] = 20000,
    'wrong prepayment percent': (d) => d['prepayment_pct'] = 19.99,
    'unverified source': (d) =>
        d['price_provenance']['request_conditions_verified'] = false,
    'wrong processed product': (d) =>
        d['price_provenance']['processed_product_type'] = 'LEASE',
    'wrong source product': (d) =>
        d['price_provenance']['market_price']['product_type'] = 'LEASE',
    'source applies zero prepayment': (d) =>
        d['price_provenance']['market_price']['applied_conditions']['prepayment_pct'] =
            0,
    'source applies another term': (d) =>
        d['price_provenance']['market_price']['applied_conditions']['term_months'] =
            48,
    'source applies another mileage': (d) =>
        d['price_provenance']['market_price']['applied_conditions']['annual_km'] =
            20000,
    'missing normalized selection': (d) => d.remove('normalized_selection'),
    'missing fingerprint': (d) => d.remove('selection_fingerprint'),
    'missing pricing context': (d) => d.remove('pricing_context_version'),
    'missing selected price': (d) => d.remove('selected_vehicle_price'),
    'zero monthly': (d) => d['monthly_payment'] = 0,
    'negative monthly': (d) => d['monthly_payment'] = -1,
  };
  for (final mutation in invalidResponses.entries) {
    test('synthetic exact DB still blocks ${mutation.key}', () async {
      final row = _syntheticExactLookup();
      mutation.value(row['response']['data'] as Map<String, dynamic>);
      await expectLater(
        _request(row),
        throwsA(isA<QuoteConditionsUnverified>()),
      );
    });
  }

  test('missing monthly cannot return a quote', () async {
    final row = _syntheticExactLookup();
    row['response']['data'].remove('monthly_payment');
    await expectLater(_request(row), throwsA(isA<QuoteConditionsUnverified>()));
  });

  test(
    'amount request rejects a different returned prepayment amount',
    () async {
      final row = _syntheticExactLookup(amountRequest: true);
      row['response']['data']['deposit']++;
      await expectLater(
        _request(row),
        throwsA(isA<QuoteConditionsUnverified>()),
      );
    },
  );

  test(
    'zero pct request cannot hide a nonzero returned guarantee amount',
    () async {
      final row = _syntheticExactLookup();
      row['request']['guarantee_pct'] = 0;
      row['response']['data']['guarantee'] = 1000000;
      await expectLater(
        _request(row),
        throwsA(isA<QuoteConditionsUnverified>()),
      );
    },
  );

  test(
    'zero amount request cannot hide a nonzero returned guarantee pct',
    () async {
      final row = _syntheticExactLookup();
      row['response']['data']['guarantee_pct'] = 10;
      await expectLater(
        _request(row),
        throwsA(isA<QuoteConditionsUnverified>()),
      );
    },
  );

  for (final percentRequest in [false, true]) {
    test('nonzero guarantee ${percentRequest ? '%' : 'KRW'} stays unsupported '
        'even when response echoes the request and source is exact', () async {
      final row = _syntheticExactLookup();
      row['response']['data']['guarantee'] = 1000000;
      row['response']['data']['guarantee_pct'] = 10;
      if (percentRequest) {
        row['request']['guarantee_pct'] = 10;
      } else {
        row['request']['guarantee'] = 1000000;
      }
      await expectLater(
        _request(row),
        throwsA(isA<QuoteConditionsUnverified>()),
      );
    });
  }

  test(
    'NONZERO_GUARANTEE_UNVERIFIED is blocked even with zero echoed values',
    () async {
      final row = _syntheticExactLookup();
      row['response']['data']['price_provenance']['unsupported_reasons'] = [
        'NONZERO_GUARANTEE_UNVERIFIED',
      ];
      await expectLater(
        _request(row),
        throwsA(isA<QuoteConditionsUnverified>()),
      );
    },
  );
}
