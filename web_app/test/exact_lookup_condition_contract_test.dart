import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/models/quote.dart';
import 'package:recar_app/models/quote_selection.dart';
import 'package:recar_app/services/api_client.dart';
import 'package:recar_app/services/quote_api.dart';
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
  final catalog =
      jsonDecode(
            File('test/fixtures/new3_catalog_20261015.json').readAsStringSync(),
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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

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
    await expectLater(_request(row), throwsA(isA<TypeError>()));
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
