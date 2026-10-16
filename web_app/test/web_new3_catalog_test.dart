import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/models/quote_selection.dart';
import 'package:recar_app/models/vehicle.dart';
import 'package:recar_app/screens/vehicle_detail_screen.dart';
import 'package:recar_app/screens/vehicle_list_screen.dart';
import 'package:recar_app/services/api_client.dart';
import 'package:recar_app/services/quote_api.dart';
import 'package:recar_app/services/vehicle_api.dart';
import 'package:recar_app/services/vehicle_cache.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _RecordedCatalog extends Interceptor {
  _RecordedCatalog(this.fixture);
  final Map<String, dynamic> fixture;
  final queries = <Map<String, dynamic>>[];
  final quoteBodies = <Map<String, dynamic>>[];
  bool duplicate = false;
  bool incomplete = false;
  bool inconsistent = false;
  int pageCount = 3;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    dynamic response;
    if (options.path == '/api/v1/vehicles/') {
      queries.add(Map<String, dynamic>.from(options.queryParameters));
      final page = options.queryParameters['page'] as int? ?? 1;
      final catalog = fixture['catalog'] as List;
      response = {
        'items': incomplete && page == pageCount ? [] :
            [catalog[duplicate ? 0 : page - 1]],
        'page': page, 'size': 1, 'pages': pageCount,
        'total': inconsistent && page == 2 ? pageCount + 1 : pageCount,
      };
    } else if (options.path == '/api/v1/quotes/instant') {
      final body = Map<String, dynamic>.from(options.data as Map);
      quoteBodies.add(body);
      final trim = (body['selection'] as Map)['vehicle_trim_id'];
      response = [...fixture['quotes'] as List, ...fixture['defaultColorQuotes'] as List].firstWhere(
        (row) => row['request']['selection']['vehicle_trim_id'] == trim &&
            row['request']['selection']['exterior_color_id'] == body['selection']['exterior_color_id'],
      )['response'];
    } else if (options.path.endsWith('/quotes') || options.path.endsWith('/options')) {
      response = [];
    } else {
      for (final detail in fixture['details'] as List) {
        if (options.path == '/api/v1/vehicles/${detail['id']}') response = detail;
      }
    }
    if (response == null) {
      handler.reject(DioException(requestOptions: options,
        response: Response(requestOptions: options, statusCode: 404)));
    } else {
      handler.resolve(Response(requestOptions: options, statusCode: 200, data: response));
    }
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final fixture = jsonDecode(File('test/fixtures/new3_catalog_20261015.json')
      .readAsStringSync()) as Map<String, dynamic>;
  late _RecordedCatalog api;
  setUp(() {
    VehicleCache.invalidateAll();
    SharedPreferences.setMockInitialValues({});
    api = _RecordedCatalog(fixture);
    ApiClient.dio.interceptors.add(api);
  });
  tearDown(() => ApiClient.dio.interceptors.remove(api));

  test('follows all advertised pages even when server clips size to one', () async {
    final items = await VehicleApi.fetchCatalog();
    expect(items.map((item) => item.id),
        (fixture['catalog'] as List).map((item) => item['id']));
    expect(api.queries.map((query) => query['page']), [1, 2, 3]);
    expect(api.queries.every((query) => query['sort'] == 'monthly_price_asc'), isTrue);
    expect(items.last.availableProductTypes, ['LEASE']);
    expect(VehicleCache.getCatalogItem(items.last.id)?.availableProductTypes, ['LEASE']);
  });
  test('display order and product filters are forwarded on every page', () async {
    await VehicleApi.fetchCatalog(sort: 'display_order', productType: 'LEASE');
    expect(api.queries.every((q) => q['sort'] == 'display_order' && q['product_type'] == 'LEASE'), isTrue);
  });
  test('refresh bypasses every public catalog page without clearing private data', () async {
    await VehicleApi.fetchCatalog();
    await VehicleApi.fetchCatalog();
    expect(api.queries.length, 3);
    await VehicleApi.fetchCatalog(forceRefresh: true);
    expect(api.queries.length, 6);
    VehicleCache.invalidateList();
    await VehicleApi.fetchCatalog();
    expect(api.queries.length, 9);
  });
  for (final mode in ['duplicate', 'incomplete', 'inconsistent']) {
    test('rejects $mode pages instead of claiming a complete catalog', () async {
      api.duplicate = mode == 'duplicate';
      api.incomplete = mode == 'incomplete';
      api.inconsistent = mode == 'inconsistent';
      await expectLater(VehicleApi.fetchCatalog(), throwsStateError);
    });
  }
  test('default monthly sort contract is unchanged', () {
    expect(vehicleListSortToServerParam('월 납입료 낮은 순'), 'monthly_price_asc');
  });
  testWidgets('domestic catalog does not force a RENTAL-only product filter', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: VehicleListScreen()));
    for (var i = 0; i < 6; i++) { await tester.pump(const Duration(milliseconds: 200)); }
    await tester.tap(find.text('국산차').first);
    for (var i = 0; i < 6; i++) { await tester.pump(const Duration(milliseconds: 200)); }
    expect(api.queries.where((q) => q['origin'] == 'domestic'), isNotEmpty);
    expect(api.queries.every((q) => q['category'] != 'DOMESTIC'), isTrue);
    expect(api.queries.every((q) => !q.containsKey('product_type')), isTrue);
    await tester.pumpWidget(const SizedBox());
  });

  void validate(Map<String, dynamic> quote, Map<String, dynamic> request) {
    QuoteApi.validateSelectionResponse(quote,
      vehicleId: request['vehicle_id'] as String,
      selection: QuoteSelection.fromJson(Map<String, dynamic>.from(request['selection'] as Map)),
      productType: request['product_type'] as String,
      term: request['term'] as int, mileageLimit: request['mileage_limit'] as int,
      deposit: 0, guarantee: 0);
  }
  for (final row in fixture['quotes'] as List) {
    final request = Map<String, dynamic>.from(row['request'] as Map);
    test('accepts recorded production EXACT quote ${request['selection']['vehicle_trim_id']}', () {
      validate(Map<String, dynamic>.from(row['response']['data'] as Map), request);
    });
  }
  for (final row in fixture['defaultColorQuotes'] as List) {
    test('web color selection is verified but not initially Sales AI eligible ${row['request']['vehicle_id']}', () {
      final quote = Map<String, dynamic>.from(row['response']['data'] as Map);
      expect(quote['price_provenance']['sales_ai_eligible'], isFalse);
      validate(quote, Map<String, dynamic>.from(row['request'] as Map));
    });
  }
  final mutations = <String, void Function(Map<String, dynamic>)>{
    'wrong vehicle': (q) => q['vehicle_id'] = 'not-the-requested-vehicle',
    'wrong trim': (q) => q['vehicle_trim_id'] = 'not-the-requested-trim',
    'wrong term': (q) => q['term'] = 48,
    'wrong mileage': (q) => q['mileage_limit'] = 20000,
    'wrong guarantee': (q) => q['guarantee'] = 100,
    'wrong prepayment': (q) => q['deposit'] = 100,
    'missing proof': (q) => q.remove('price_provenance'),
    'unverified': (q) => q['price_provenance']['request_conditions_verified'] = false,
    'ineligible': (q) => q['price_provenance']['sales_ai_eligible'] = false,
    'wrong product': (q) => q['price_provenance']['processed_product_type'] = 'LEASE',
    'approximate source': (q) => q['price_provenance']['market_price']['match_status'] = 'NEAREST',
    'unknown condition': (q) => q['price_provenance']['market_price']['condition_match']['annual_km'] = 'UNKNOWN',
  };
  for (final mutation in mutations.entries) {
    test('fails closed for ${mutation.key}', () {
      final row = jsonDecode(jsonEncode((fixture['quotes'] as List).first)) as Map<String, dynamic>;
      final quote = row['response']['data'] as Map<String, dynamic>;
      mutation.value(quote);
      expect(() => validate(quote, row['request'] as Map<String, dynamic>),
          throwsA(isA<QuoteConditionsUnverified>()));
    });
  }
  test('black model empty colors/options remain a valid catalog, not missing data', () {
    final black = (fixture['details'] as List)[1] as Map<String, dynamic>;
    final detail = VehicleDetail.fromJson(black);
    expect(detail.trims.length, 3);
    expect(detail.trims.every((trim) => trim.options.isEmpty && trim.colors.isEmpty), isTrue);
  });
  testWidgets('cold detail resolves availability by model query without a brand guess', (tester) async {
    final item = (fixture['catalog'] as List).last;
    await tester.pumpWidget(MaterialApp(home: VehicleDetailScreen(vehicleId: item['id'] as String)));
    for (var i = 0; i < 16; i++) { await tester.pump(const Duration(milliseconds: 250)); }
    expect(api.queries.every((q) => q['query'] == item['model_name']), isTrue);
    expect(api.queries.length, 3);
    expect(api.quoteBodies.single['product_type'], 'LEASE');
    expect(find.text(QuoteApi.selectionPriceUnavailableMessage), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('detail refreshes a legacy public catalog item missing product metadata', (tester) async {
    final item = Map<String, dynamic>.from((fixture['catalog'] as List).last as Map);
    final legacy = {...item, 'available_product_types': <String>[]};
    VehicleCache.setList('legacy-public-catalog', VehicleListResponse(
      items: [VehicleListItem.fromJson(legacy)], page: 1, size: 1, total: 1, pages: 1,
    ));
    await tester.pumpWidget(MaterialApp(home: VehicleDetailScreen(vehicleId: item['id'] as String)));
    for (var i = 0; i < 16; i++) { await tester.pump(const Duration(milliseconds: 250)); }
    expect(api.queries.length, 3);
    expect(api.quoteBodies.single['product_type'], 'LEASE');
    expect(VehicleCache.getCatalogItem(item['id'] as String)?.availableProductTypes, ['LEASE']);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  for (final item in fixture['catalog'] as List) {
    testWidgets('detail resolves ${item['model_name']} from available_product_types', (tester) async {
      await tester.runAsync(() => VehicleApi.fetchCatalog());
      tester.view.physicalSize = const Size(430, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(MaterialApp(home: VehicleDetailScreen(vehicleId: item['id'] as String)));
      for (var i = 0; i < 12; i++) { await tester.pump(const Duration(milliseconds: 250)); }
      expect(api.quoteBodies, isNotEmpty);
      expect(api.quoteBodies.every((body) => body['product_type'] == (item['available_product_types'] as List).single), isTrue);
      expect(find.text(QuoteApi.selectionPriceUnavailableMessage), findsNothing);
      if ((item['available_product_types'] as List).single == 'LEASE') {
        expect(tester.widgetList<Image>(find.byType(Image)).any((image) =>
            image.image is NetworkImage &&
            (image.image as NetworkImage).url == item['image_url']), isTrue,
            reason: 'Actual API image must take precedence over the generic illustration');
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
