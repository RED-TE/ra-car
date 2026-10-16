import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/models/application.dart';
import 'package:recar_app/models/auth.dart';
import 'package:recar_app/models/quote.dart';
import 'package:recar_app/models/quote_selection.dart';
import 'package:recar_app/models/vehicle.dart';
import 'package:recar_app/screens/quote_result_screen.dart';
import 'package:recar_app/screens/vehicle_detail_screen.dart';
import 'package:recar_app/services/api_client.dart';
import 'package:recar_app/services/application_api.dart';
import 'package:recar_app/services/auth_session.dart';
import 'package:recar_app/services/quote_api.dart';
import 'package:recar_app/services/vehicle_cache.dart';
import 'package:recar_app/widgets/micro_interactions.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('trim selection contract', () {
    test('recognizes selection price unavailable error envelopes', () {
      DioException errorFor(Map<String, dynamic> data) {
        final request = RequestOptions(path: '/api/v1/quotes/instant');
        return DioException(
          requestOptions: request,
          response: Response<dynamic>(
            requestOptions: request,
            statusCode: 422,
            data: data,
          ),
        );
      }

      expect(
        QuoteApi.isSelectionPriceUnavailable(
          errorFor(const {
            'error': {'code': 'PRICE_UNAVAILABLE'},
          }),
        ),
        isTrue,
      );
      expect(
        QuoteApi.isSelectionPriceUnavailable(
          errorFor(const {
            'detail': {'code': 'REFERENCE_PRICE_UNRESOLVED'},
          }),
        ),
        isTrue,
      );
      expect(
        QuoteApi.isSelectionPriceUnavailable(
          errorFor(const {
            'detail': {'code': 'SELECTION_PRICING_UNAVAILABLE'},
          }),
        ),
        isTrue,
      );
      expect(
        QuoteApi.isSelectionPriceUnavailable(
          errorFor(const {
            'error': {'code': 'INVALID_SELECTION'},
          }),
        ),
        isFalse,
      );
    });

    test('parses GROUPED, FLAT and UNAVAILABLE without legacy fabrication', () {
      final grouped = VehicleTrimSelection.fromJson({
        'mode': 'GROUPED',
        'default_vehicle_trim_id': 'trim-hybrid-signature',
        'groups': [
          {
            'key': 'hybrid',
            'name': '1.6 하이브리드',
            'min_price': 42000000,
            'grades': [
              {
                'vehicle_trim_id': 'trim-hybrid-signature',
                'name': '시그니처',
                'model_spec': '1.6 하이브리드',
                'base_price': 42000000,
                'is_active': true,
              },
            ],
          },
        ],
        'flat_grades': const [],
      });
      final flat = VehicleTrimSelection.fromJson({
        'mode': 'FLAT',
        'flat_grades': [
          {'vehicle_trim_id': 'trim-flat', 'name': '프레스티지', 'is_active': true},
        ],
      });
      final unavailable = VehicleTrimSelection.fromJson({
        'mode': 'UNAVAILABLE',
        'unavailable_message': '세부 등급 정보 준비 중',
      });

      expect(grouped.mode, VehicleTrimSelectionMode.grouped);
      expect(grouped.defaultVehicleTrimId, 'trim-hybrid-signature');
      expect(grouped.groups.single.minPrice, 42000000);
      expect(
        grouped.activeLeaves.single.vehicleTrimId,
        'trim-hybrid-signature',
      );
      expect(flat.mode, VehicleTrimSelectionMode.flat);
      expect(flat.activeLeaves.single.label, '프레스티지');
      expect(unavailable.mode, VehicleTrimSelectionMode.unavailable);
      expect(unavailable.activeLeaves, isEmpty);
      expect(unavailable.isProvided, isTrue);
      expect(VehicleTrimSelection.fromJson(null).isProvided, isFalse);
    });

    test('snapshot serializes real leaf identity and server-owned price', () {
      const snapshot = QuoteSnapshotRequest(
        quoteType: 'lease',
        vehicleTrimId: 'trim-1',
        selectionMode: 'GROUPED',
        modelSpec: '1.6 하이브리드',
        gradeName: '시그니처',
        vehicleTrimBasePrice: 42000000,
        quotedMonthlyPayment: 443200,
      );

      expect(snapshot.toJson(), containsPair('vehicle_trim_id', 'trim-1'));
      expect(snapshot.toJson(), containsPair('quote_type', 'lease'));
      expect(snapshot.toJson(), containsPair('selection_mode', 'GROUPED'));
      expect(snapshot.toJson(), containsPair('quoted_monthly_payment', 443200));
    });

    test('parses server-owned market pricing proof fields', () {
      final data = QuoteData.fromJson({
        'tier': 'STANDARD',
        'vehicle_id': 'vehicle-1',
        'term': 60,
        'deposit': 0,
        'mileage_limit': 20000,
        'monthly_payment': 443200,
        'otd_total': 35000000,
        'vehicle_price': 35000000,
        'residual_value': 15000000,
        'residual_pct': 0.42,
        'promo_discount': 0,
        'estimated_discount': 0,
        'estimated_taxes': 0,
        'breakdown': const [],
        'vehicle_trim_id': 'trim-1',
        'trim_pricing_applied': true,
        'trim_pricing_status': 'MARKET_PRICE_APPLIED',
        'pricing_basis': 'CHAZM_IMPORTED',
        'market_pricing_applied': true,
        'price_source': 'CHAZM_IMPORTED',
        'base_monthly_payment': 413200,
        'display_adjustment': 30000,
      });

      expect(data.trimPricingApplied, isTrue);
      expect(data.trimPricingStatus, 'MARKET_PRICE_APPLIED');
      expect(data.pricingBasis, 'CHAZM_IMPORTED');
      expect(data.marketPricingApplied, isTrue);
      expect(data.priceSource, 'CHAZM_IMPORTED');
      expect(data.baseMonthlyPayment, 413200);
      expect(data.displayAdjustment, 30000);
      expect(hasAppliedCanonicalTrimPricingFor(data, 'trim-1'), isTrue);
      expect(hasAppliedCanonicalTrimPricingFor(data, 'trim-other'), isFalse);
      expect(
        resolveQuoteResultMonthlyForDisplay(
          data: data,
          cachedMonthly: 111100,
          hasQuoteError: false,
          instantDeliveryPremiumWon: 9900,
        ),
        443200,
      );
    });

    test('application create sends selected VehicleTrim.id', () async {
      SharedPreferences.setMockInitialValues({});
      final interceptor = _TrimSelectionInterceptor();
      ApiClient.dio.interceptors.add(interceptor);
      addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));

      await ApplicationApi.createApplication(
        vehicleId: 'vehicle-1',
        vehicleTrimId: 'trim-1',
      );

      expect(interceptor.applicationBodies.single['vehicle_id'], 'vehicle-1');
      expect(interceptor.applicationBodies.single['vehicle_trim_id'], 'trim-1');
    });
  });

  group('quote trim selection UI', () {
    late _TrimSelectionInterceptor interceptor;

    setUp(() {
      VehicleCache.invalidateAll();
      interceptor = _TrimSelectionInterceptor();
      ApiClient.dio.interceptors.add(interceptor);
    });

    tearDown(() {
      ApiClient.dio.interceptors.remove(interceptor);
      VehicleCache.invalidateAll();
    });

    for (final layout in [(390.0, 1.0), (320.0, 2.0)]) {
      testWidgets(
        'sticky monthly is unframed at width ${layout.$1} and scale ${layout.$2}',
        (tester) async {
          await tester.binding.setSurfaceSize(const Size(390, 844));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          interceptor.details['vehicle-sticky'] = _vehicleDetailJson(
            vehicleId: 'vehicle-sticky',
            trimSelection: {
              'mode': 'FLAT',
              'groups': const [],
              'flat_grades': [_selectionLeaf('trim-sticky', '모던')],
            },
            trims: [_legacyTrim('trim-sticky', '모던')],
          );

          await tester.pumpWidget(
            const MaterialApp(
              home: VehicleDetailScreen(
                vehicleId: 'vehicle-sticky',
                initialTrimId: 'trim-sticky',
              ),
            ),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 700));

          final controller = tester
              .widgetList<SingleChildScrollView>(
                find.byType(SingleChildScrollView),
              )
              .firstWhere((scroll) => scroll.controller != null)
              .controller!;
          controller.jumpTo(controller.position.maxScrollExtent);
          await tester.pump(const Duration(milliseconds: 400));

          final summary = find.byKey(const ValueKey('sticky-monthly-content'));
          expect(summary, findsOneWidget);
          final summaryWidget = tester.widget<Padding>(summary);
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.binding.setSurfaceSize(Size(layout.$1, 844));
          await tester.pumpWidget(
            MaterialApp(
              home: Scaffold(
                bottomNavigationBar: MediaQuery(
                  data: MediaQueryData(
                    textScaler: TextScaler.linear(layout.$2),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: summaryWidget,
                  ),
                ),
              ),
            ),
          );
          await tester.pump(const Duration(milliseconds: 200));
          final label = find.descendant(
            of: summary,
            matching: find.text('월 납입료'),
          );
          final amount = find.descendant(
            of: summary,
            matching: find.text('443,200원'),
          );
          expect(summary, findsOneWidget);
          expect(label, findsOneWidget);
          expect(amount, findsOneWidget);
          expect(
            find.descendant(of: summary, matching: find.byType(DecoratedBox)),
            findsNothing,
          );
          expect(
            find.descendant(of: summary, matching: find.text('월 443,200원')),
            findsNothing,
          );
          final bounds = tester.getRect(summary);
          expect(bounds.contains(tester.getCenter(label)), isTrue);
          expect(bounds.contains(tester.getCenter(amount)), isTrue);
          expect(tester.getRect(amount).bottom, lessThan(844));
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets('GROUPED uses trim then grade and sends VehicleTrim.id', (
      tester,
    ) async {
      interceptor.details['vehicle-1'] = _vehicleDetailJson(
        vehicleId: 'vehicle-1',
        trimSelection: {
          'mode': 'GROUPED',
          'groups': [
            {
              'key': 'hybrid',
              'name': '1.6 하이브리드',
              'grades': [
                {
                  'vehicle_trim_id': 'trim-hybrid-prestige',
                  'name': '프레스티지',
                  'model_spec': '1.6 하이브리드',
                  'base_price': 39000000,
                  'is_active': true,
                },
                {
                  'vehicle_trim_id': 'trim-hybrid-signature',
                  'name': '시그니처',
                  'model_spec': '1.6 하이브리드',
                  'base_price': 42000000,
                  'is_active': true,
                },
              ],
            },
          ],
          'flat_grades': const [],
        },
      );

      await _pumpQuote(tester, vehicleId: 'vehicle-1');
      await _openQuoteTrimGradeSheet(tester);
      expect(find.text('등급 선택'), findsOneWidget);

      await tester.tap(find.text('시그니처'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, '선택 완료'));
      await tester.pumpAndSettle();

      expect(find.text('1.6 하이브리드'), findsOneWidget);
      expect(find.text('시그니처'), findsOneWidget);
      expect(
        _requestedTrimId(interceptor.quoteBodies.last),
        'trim-hybrid-signature',
      );
      expect(find.text('선택 등급의 월 납입료를 확인하고 있어요'), findsNothing);
    });

    testWidgets('detail loading blocks submission until mode is known', (
      tester,
    ) async {
      interceptor.pendingDetail = Completer<Map<String, dynamic>>();

      await tester.pumpWidget(
        MaterialApp(
          home: QuoteResultScreen(
            quote: _quote('vehicle-loading'),
            vehicleName: '코나',
            vehicleBrand: '현대',
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('세부 등급 정보 확인 중'), findsOneWidget);
      expect(find.text('이 조건으로 자세한 분석 받기'), findsOneWidget);
      final loadingCta = tester.widget<InkWell>(
        find.ancestor(
          of: find.text('이 조건으로 자세한 분석 받기'),
          matching: find.byType(InkWell),
        ),
      );
      expect(loadingCta.onTap, isNull);

      interceptor.pendingDetail!.complete(
        _vehicleDetailJson(
          vehicleId: 'vehicle-loading',
          trimSelection: {
            'mode': 'GROUPED',
            'default_vehicle_trim_id': 'trim-a',
            'groups': [
              {
                'key': 'gas',
                'name': '가솔린 1.6',
                'grades': [
                  {
                    'vehicle_trim_id': 'trim-a',
                    'name': '모던',
                    'model_spec': '가솔린 1.6',
                    'base_price': 30000000,
                    'is_active': true,
                  },
                  {
                    'vehicle_trim_id': 'trim-b',
                    'name': '인스퍼레이션',
                    'model_spec': '가솔린 1.6',
                    'base_price': 35000000,
                    'is_active': true,
                  },
                ],
              },
            ],
            'flat_grades': const [],
          },
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('가솔린 1.6'), findsOneWidget);
      expect(find.text('모던'), findsOneWidget);
      expect(interceptor.applicationBodies, isEmpty);
    });

    testWidgets('one FLAT leaf auto-selects and disables CTA while repricing', (
      tester,
    ) async {
      interceptor.details['vehicle-1'] = _vehicleDetailJson(
        vehicleId: 'vehicle-1',
        trimSelection: {
          'mode': 'FLAT',
          'groups': const [],
          'flat_grades': [
            {
              'vehicle_trim_id': 'trim-only',
              'name': '프레스티지',
              'base_price': 35000000,
              'is_active': true,
            },
          ],
        },
      );
      interceptor.pendingQuote = Completer<Response<dynamic>>();

      await tester.pumpWidget(
        MaterialApp(
          home: QuoteResultScreen(
            quote: _quote('vehicle-1'),
            vehicleName: '코나',
            vehicleBrand: '현대',
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('프레스티지'), findsOneWidget);
      expect(find.text('월 납입료 확인 중이에요'), findsOneWidget);

      interceptor.pendingQuote!.complete(
        _quoteResponse(
          interceptor.lastQuoteRequest!,
          vehicleId: 'vehicle-1',
          vehicleTrimId: 'trim-only',
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('선택 등급의 월 납입료를 확인하고 있어요'), findsNothing);
      expect(interceptor.quoteBodies, hasLength(1));
    });

    testWidgets('incomplete pricing proof fails closed and disables CTA', (
      tester,
    ) async {
      interceptor.details['vehicle-proof'] = _vehicleDetailJson(
        vehicleId: 'vehicle-proof',
        trimSelection: {
          'mode': 'FLAT',
          'groups': const [],
          'flat_grades': [_selectionLeaf('trim-proof', '프레스티지')],
        },
      );

      await tester.pumpWidget(
        MaterialApp(
          home: QuoteResultScreen(
            quote: _quote(
              'vehicle-proof',
              vehicleTrimId: 'trim-proof',
              trimPricingApplied: true,
              trimPricingStatus: 'APPLIED',
              pricingBasis: null,
            ),
            vehicleName: '코나',
            vehicleBrand: '현대',
            vehicleTrimId: 'trim-proof',
          ),
        ),
      );
      await tester.pumpAndSettle();
      await _scrollQuoteTrimGradeRowIntoView(tester);

      expect(find.text('선택 등급의 가격 근거를 확인할 수 없어요. 등급을 다시 선택해 주세요.'),
          findsOneWidget);
      final cta = tester.widget<InkWell>(
        find.ancestor(
          of: find.text('이 조건으로 자세한 분석 받기'),
          matching: find.byType(InkWell),
        ),
      );
      expect(cta.onTap, isNull);
    });

    testWidgets(
      'trim switching preserves a direct deposit amount without local math',
      (tester) async {
        interceptor.details['vehicle-deposit'] = _vehicleDetailJson(
          vehicleId: 'vehicle-deposit',
          trimSelection: {
            'mode': 'FLAT',
            'groups': const [],
            'flat_grades': [
              _selectionLeaf('trim-cheap', '프레스티지', price: 30000000),
              _selectionLeaf('trim-pricey', '시그니처', price: 42000000),
            ],
          },
        );

        await tester.pumpWidget(
          MaterialApp(
            home: QuoteResultScreen(
              quote: _quote(
                'vehicle-deposit',
                vehicleTrimId: 'trim-cheap',
                deposit: 3000000,
                vehiclePrice: 30000000,
              ),
              vehicleName: '코나',
              vehicleBrand: '현대',
              vehicleTrimId: 'trim-cheap',
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 900));
        await _openQuoteTrimGradeSheet(tester);
        await tester.tap(find.text('시그니처'));
        await tester.pump();
        await tester.tap(find.widgetWithText(FilledButton, '선택 완료'));
        await tester.pumpAndSettle();

        expect(_requestedTrimId(interceptor.quoteBodies.last), 'trim-pricey');
        expect(interceptor.quoteBodies.last['deposit'], 3000000);
        expect(
          interceptor.quoteBodies.last.containsKey('prepayment_pct'),
          isFalse,
        );
      },
    );

    testWidgets('UNAVAILABLE is neutral and does not open a picker', (
      tester,
    ) async {
      interceptor.details['vehicle-1'] = _vehicleDetailJson(
        vehicleId: 'vehicle-1',
        trimSelection: {
          'mode': 'UNAVAILABLE',
          'groups': const [],
          'flat_grades': const [],
          'unavailable_message': '세부 등급 정보 준비 중',
        },
      );

      await _pumpQuote(tester, vehicleId: 'vehicle-1');
      expect(find.text('세부 등급 정보 준비 중'), findsNWidgets(2));

      await _scrollQuoteTrimGradeRowIntoView(tester);
      await tester.tap(find.byKey(const ValueKey('quote-trim-grade-row')));
      await tester.pumpAndSettle();
      expect(find.text('트림과 등급을 선택해주세요'), findsNothing);
      expect(find.text('등급을 선택해주세요'), findsNothing);
      expect(interceptor.quoteBodies, isEmpty);
    });

    testWidgets('UNAVAILABLE keeps the legacy vehicle-level quote flow', (
      tester,
    ) async {
      interceptor.details['vehicle-unavailable'] = _vehicleDetailJson(
        vehicleId: 'vehicle-unavailable',
        trimSelection: {
          'mode': 'UNAVAILABLE',
          'groups': const [],
          'flat_grades': const [],
          'unavailable_message': '세부 등급 정보 준비 중',
        },
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: VehicleDetailScreen(
            vehicleId: 'vehicle-unavailable',
            initialMonthlyPayment: 443200,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('세부 등급 정보 준비 중'), findsOneWidget);
      expect(find.textContaining('불러오지 못했습니다'), findsNothing);

      await tester.tap(find.text('견적 분석 받아보기'));
      await tester.pumpAndSettle();

      expect(interceptor.quoteBodies, isNotEmpty);
      expect(
        interceptor.quoteBodies.last.containsKey('selection'),
        isFalse,
      );
      expect(find.text('세부 등급 정보 준비 중'), findsNWidgets(2));
    });

    testWidgets(
      'canonical trim monthly overrides list cache and instant display premium',
      (tester) async {
        interceptor.details['vehicle-applied-price'] = _vehicleDetailJson(
          vehicleId: 'vehicle-applied-price',
          trimSelection: {
            'mode': 'FLAT',
            'groups': const [],
            'flat_grades': [
              _selectionLeaf('trim-applied', '프레스티지', price: 35000000),
            ],
          },
          trims: [_legacyTrim('trim-applied', '프레스티지', price: 35000000)],
        );

        await tester.pumpWidget(
          const MaterialApp(
            home: VehicleDetailScreen(
              vehicleId: 'vehicle-applied-price',
              initialTrimId: 'trim-applied',
              initialDepositPct: 10,
              initialMonthlyPayment: 111100,
              instantDeliveryPremiumWon: 9900,
              instantDeliveryDiscountWon: 5000000,
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 700));

        expect(interceptor.quoteBodies, isNotEmpty);
        expect(
          _requestedTrimId(interceptor.quoteBodies.first),
          'trim-applied',
        );
        expect(
          interceptor.quoteBodies.first.containsKey('deposit'),
          isFalse,
        );
        expect(interceptor.quoteBodies.first['prepayment_pct'], 10);
        expect(_displayedAmount(443200), findsWidgets);
        expect(_displayedAmount(453100), findsNothing);
      },
    );

    testWidgets('explicit UNAVAILABLE excludes inactive legacy trims', (
      tester,
    ) async {
      interceptor.details['vehicle-inactive'] = _vehicleDetailJson(
        vehicleId: 'vehicle-inactive',
        trimSelection: {
          'mode': 'UNAVAILABLE',
          'groups': const [],
          'flat_grades': const [],
          'unavailable_message': '세부 등급 정보 준비 중',
        },
        trims: [_legacyTrim('trim-inactive', '판매 종료', isAvailable: false)],
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: VehicleDetailScreen(
            vehicleId: 'vehicle-inactive',
            initialMonthlyPayment: 443200,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('세부 등급 정보 준비 중'), findsOneWidget);
      expect(find.text('판매 종료'), findsNothing);

      await tester.tap(find.text('견적 분석 받아보기'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(interceptor.quoteBodies, isNotEmpty);
      expect(
        interceptor.quoteBodies.first.containsKey('selection'),
        isFalse,
      );
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
    });

    testWidgets('vehicle detail auto-selects the server default leaf', (
      tester,
    ) async {
      final groupedSelection = {
        'mode': 'GROUPED',
        'default_vehicle_trim_id': 'trim-a',
        'groups': [
          {
            'key': 'gas',
            'name': '가솔린 1.6',
            'grades': [
              _selectionLeaf('trim-a', '모던', modelSpec: '가솔린 1.6'),
              _selectionLeaf(
                'trim-b',
                '인스퍼레이션',
                modelSpec: '가솔린 1.6',
                price: 35000000,
              ),
            ],
          },
        ],
        'flat_grades': const [],
      };
      interceptor.details['vehicle-multiple'] = _vehicleDetailJson(
        vehicleId: 'vehicle-multiple',
        trimSelection: groupedSelection,
        trims: [
          _legacyTrim('trim-a', '모던', modelSpec: '가솔린 1.6'),
          _legacyTrim(
            'trim-b',
            '인스퍼레이션',
            modelSpec: '가솔린 1.6',
            price: 35000000,
          ),
        ],
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: VehicleDetailScreen(
            vehicleId: 'vehicle-multiple',
            initialMonthlyPayment: 443200,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.textContaining('가솔린 1.6 모던'), findsWidgets);
      expect(interceptor.quoteBodies, isNotEmpty);
      expect(_requestedTrimId(interceptor.quoteBodies.first), 'trim-a');
      expect(
        find.byKey(const ValueKey('canonical-monthly-skeleton')),
        findsNothing,
      );
    });

    testWidgets(
      'canonical proof replaces a stale list monthly for the default grade',
      (tester) async {
        interceptor.details['vehicle-default-loading'] = _vehicleDetailJson(
          vehicleId: 'vehicle-default-loading',
          trimSelection: {
            'mode': 'FLAT',
            'default_vehicle_trim_id': 'trim-default',
            'groups': const [],
            'flat_grades': [
              _selectionLeaf('trim-default', '프레스티지'),
            ],
          },
          trims: [_legacyTrim('trim-default', '프레스티지')],
        );
        interceptor.pendingQuote = Completer<Response<dynamic>>();

        await tester.pumpWidget(
          const MaterialApp(
            home: VehicleDetailScreen(
              vehicleId: 'vehicle-default-loading',
              initialMonthlyPayment: 111100,
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));

        expect(
          find.byKey(const ValueKey('canonical-monthly-skeleton')),
          findsOneWidget,
        );
        expect(_displayedAmount(111100), findsNothing);
        expect(find.text('월 납입료를 조회하고 있어요'), findsOneWidget);

        interceptor.pendingQuote!.complete(
          _quoteResponse(
            interceptor.lastQuoteRequest!,
            vehicleId: 'vehicle-default-loading',
            vehicleTrimId: 'trim-default',
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 900));

        expect(
          find.byKey(const ValueKey('canonical-monthly-skeleton')),
          findsNothing,
        );
        expect(_displayedAmount(111100), findsNothing);
        expect(
            find.byWidgetPredicate((widget) =>
                widget is RollingMoneyText && widget.amount == 443200),
            findsOneWidget);
      },
    );

    testWidgets(
      'mismatched canonical response fails closed without showing model price',
      (tester) async {
        interceptor.details['vehicle-proof-mismatch'] = _vehicleDetailJson(
          vehicleId: 'vehicle-proof-mismatch',
          trimSelection: {
            'mode': 'FLAT',
            'default_vehicle_trim_id': 'trim-expected',
            'groups': const [],
            'flat_grades': [
              _selectionLeaf('trim-expected', '프레스티지'),
            ],
          },
          trims: [_legacyTrim('trim-expected', '프레스티지')],
        );
        interceptor.pendingQuote = Completer<Response<dynamic>>();

        await tester.pumpWidget(
          const MaterialApp(
            home: VehicleDetailScreen(
              vehicleId: 'vehicle-proof-mismatch',
              initialMonthlyPayment: 111100,
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        interceptor.pendingQuote!.complete(
          _quoteResponse(
            interceptor.lastQuoteRequest!,
            vehicleId: 'vehicle-proof-mismatch',
            vehicleTrimId: 'trim-other',
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 900));

        expect(
          find.byKey(const ValueKey('canonical-monthly-unavailable')),
          findsOneWidget,
        );
        expect(_displayedAmount(111100), findsNothing);
        expect(
          find.text(QuoteApi.selectionPriceUnavailableMessage),
          findsOneWidget,
        );
        expect(find.text('신청 화면을 준비하고 있어요'), findsNothing);
        expect(find.text('월 납입료 다시 불러오기'), findsNothing);
        expect(find.text('가격 확인 요청하기'), findsOneWidget);
        expect(find.text('조건 변경'), findsOneWidget);
        interceptor.pendingQuote = null;
        await tester.tap(find.text('조건 변경'));
        await tester.pumpAndSettle();
        expect(interceptor.quoteBodies, hasLength(1),
            reason: 'An unsupported price must not silently retry');
        await tester.tap(find.text('4년').last);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        await tester.pump(const Duration(milliseconds: 900));
        expect(find.byKey(const ValueKey('canonical-monthly-unavailable')),
            findsNothing);
        expect(
            find.byWidgetPredicate((widget) =>
                widget is RollingMoneyText && widget.amount == 443200),
            findsOneWidget);
      },
    );

    testWidgets('failed quote retries without submitting an application',
        (tester) async {
      interceptor.details['vehicle-retry'] = _vehicleDetailJson(
        vehicleId: 'vehicle-retry',
        trimSelection: {
          'mode': 'FLAT',
          'default_vehicle_trim_id': 'trim-retry',
          'groups': const [],
          'flat_grades': [_selectionLeaf('trim-retry', '프레스티지')],
        },
        trims: [_legacyTrim('trim-retry', '프레스티지')],
      );
      interceptor.failNextQuoteStatus = 503;
      await tester.pumpWidget(const MaterialApp(
        home: VehicleDetailScreen(vehicleId: 'vehicle-retry'),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 900));
      expect(interceptor.quoteBodies.length, 1);
      expect(find.text('월 납입료 다시 불러오기'), findsOneWidget);
      expect(find.byKey(const ValueKey('canonical-monthly-unavailable')),
          findsOneWidget);
      expect(interceptor.applicationBodies, isEmpty);
      await tester.tap(find.text('월 납입료 다시 불러오기'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 900));
      expect(interceptor.quoteBodies.length, 2);
      expect(
          find.byWidgetPredicate((widget) =>
              widget is RollingMoneyText && widget.amount == 443200),
          findsOneWidget);
      expect(interceptor.applicationBodies, isEmpty);
    });

    testWidgets('a stalled quote exits loading and permits a fresh request',
        (tester) async {
      interceptor.details['vehicle-timeout'] = _vehicleDetailJson(
        vehicleId: 'vehicle-timeout',
        trimSelection: {
          'mode': 'FLAT',
          'default_vehicle_trim_id': 'trim-timeout',
          'groups': const [],
          'flat_grades': [_selectionLeaf('trim-timeout', '프레스티지')],
        },
        trims: [_legacyTrim('trim-timeout', '프레스티지')],
      );
      interceptor.pendingQuote = Completer<Response<dynamic>>();
      await tester.pumpWidget(const MaterialApp(
        home: VehicleDetailScreen(vehicleId: 'vehicle-timeout'),
      ));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.text('월 납입료를 조회하고 있어요'), findsOneWidget);
      await tester.pump(QuoteApi.requestTimeout);
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.text(QuoteApi.requestTimeoutMessage), findsOneWidget);
      expect(find.text('월 납입료를 조회하고 있어요'), findsNothing);
      expect(find.text('월 납입료 다시 불러오기'), findsOneWidget);
      expect(interceptor.lastQuoteRequest!.cancelToken!.isCancelled, isTrue);

      final old = interceptor.pendingQuote!;
      final oldRequest = interceptor.lastQuoteRequest!;
      interceptor.pendingQuote = null;
      await tester.tap(find.text('월 납입료 다시 불러오기'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 900));
      expect(_displayedAmount(443200), findsWidgets);
      old.complete(_quoteResponse(oldRequest,
          vehicleId: 'vehicle-timeout', monthlyPayment: 111100));
      await tester.pump(const Duration(milliseconds: 500));
      expect(_displayedAmount(111100), findsNothing);
      expect(interceptor.applicationBodies, isEmpty);
    });

    for (final width in [320.0, 390.0, 430.0]) {
      testWidgets('unavailable price remains actionable at $width and 2x text',
          (tester) async {
        await tester.binding.setSurfaceSize(Size(width, 844));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        interceptor.details['vehicle-unverified-layout'] = _vehicleDetailJson(
          vehicleId: 'vehicle-unverified-layout',
          trimSelection: {
            'mode': 'FLAT', 'default_vehicle_trim_id': 'trim-layout',
            'groups': const [],
            'flat_grades': [_selectionLeaf('trim-layout', '프레스티지')],
          },
          trims: [_legacyTrim('trim-layout', '프레스티지')],
        );
        interceptor.failNextQuoteStatus = 422;
        interceptor.failNextQuoteData = const {
          'detail': {'code': 'SELECTION_PRICE_UNRESOLVED'},
        };
        await tester.pumpWidget(MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: const VehicleDetailScreen(vehicleId: 'vehicle-unverified-layout',
              initialTerm: 60, initialMileageLimit: 20000),
        ));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        await tester.pump(const Duration(milliseconds: 900));
        final label = find.text('가격 확인 요청하기');
        final button = find.ancestor(of: label, matching: find.byType(InkWell));
        expect(tester.getSize(label).height,
            lessThanOrEqualTo(tester.getSize(button).height));
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('unverified web quote submits conditions but never a price',
        (tester) async {
      interceptor.details['vehicle-price-check'] = _vehicleDetailJson(
        vehicleId: 'vehicle-price-check',
        trimSelection: {
          'mode': 'FLAT',
          'default_vehicle_trim_id': 'trim-price-check',
          'groups': const [],
          'flat_grades': [_selectionLeaf('trim-price-check', '프레스티지')],
        },
        trims: [_legacyTrim('trim-price-check', '프레스티지')],
      );
      interceptor.failNextQuoteStatus = 422;
      interceptor.failNextQuoteData = const {
        'detail': {'code': 'SELECTION_PRICE_UNRESOLVED'},
      };
      await tester.pumpWidget(const MaterialApp(
        home: VehicleDetailScreen(vehicleId: 'vehicle-price-check',
            initialTerm: 60, initialMileageLimit: 20000),
      ));
      await tester.pumpAndSettle();
      expect(find.text('월 납입료를 조회하고 있어요'), findsNothing);
      await tester.tap(find.text('가격 확인 요청하기'));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.widgetWithText(TextFormField, '이름을 입력해 주세요.'), '합성 테스트');
      await tester.enterText(
          find.widgetWithText(TextFormField, '010-0000-0000'), '01000000000');
      await tester.tap(find.byType(Checkbox));
      await tester.tap(find.text('문의 접수하기'));
      await tester.pumpAndSettle();
      expect(find.text('문의가 접수됐어요'), findsOneWidget);
      final body = interceptor.inquiryBodies.single;
      expect(body['term_months'], 60);
      expect(body['mileage_per_year'], 20000);
      expect(body['condition_summary'], contains('선납금 0%'));
      expect(body.containsKey('quoted_monthly_payment'), isFalse);
      expect(interceptor.applicationBodies, isEmpty);
    }, skip: !kIsWeb);

    testWidgets(
      'wrong selection contract version is not accepted as pricing proof',
      (tester) async {
        interceptor.details['vehicle-contract-mismatch'] = _vehicleDetailJson(
          vehicleId: 'vehicle-contract-mismatch',
          trimSelection: {
            'mode': 'FLAT',
            'default_vehicle_trim_id': 'trim-contract',
            'groups': const [],
            'flat_grades': [
              _selectionLeaf('trim-contract', '프레스티지'),
            ],
          },
          trims: [_legacyTrim('trim-contract', '프레스티지')],
        );
        interceptor.pendingQuote = Completer<Response<dynamic>>();

        await tester.pumpWidget(
          const MaterialApp(
            home: VehicleDetailScreen(
              vehicleId: 'vehicle-contract-mismatch',
              initialMonthlyPayment: 111100,
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        interceptor.pendingQuote!.complete(
          _quoteResponse(
            interceptor.lastQuoteRequest!,
            vehicleId: 'vehicle-contract-mismatch',
            vehicleTrimId: 'trim-contract',
            selectionContractVersion: 'selection_v0',
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 900));

        expect(_displayedAmount(111100), findsNothing);
        expect(_displayedAmount(443200), findsNothing);
        expect(
          find.text(QuoteApi.selectionPriceUnavailableMessage),
          findsOneWidget,
        );
        expect(find.text('신청 화면을 준비하고 있어요'), findsNothing);
        expect(find.text('가격 확인 요청하기'), findsOneWidget);
      },
    );

    testWidgets(
      'fresh product quote failure clears the previous proof and monthly',
      (tester) async {
        interceptor.details['vehicle-product-refresh'] = _vehicleDetailJson(
          vehicleId: 'vehicle-product-refresh',
          trimSelection: {
            'mode': 'FLAT',
            'default_vehicle_trim_id': 'trim-product',
            'groups': const [],
            'flat_grades': [
              _selectionLeaf('trim-product', '프레스티지'),
            ],
          },
          trims: [_legacyTrim('trim-product', '프레스티지')],
        );

        await tester.pumpWidget(
          const MaterialApp(
            home: VehicleDetailScreen(
              vehicleId: 'vehicle-product-refresh',
              initialIsLongRent: true,
              initialMonthlyPayment: 111100,
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 900));
        expect(_displayedAmount(443200), findsWidgets);
        expect(interceptor.quoteBodies, hasLength(1));

        interceptor
          ..quoteGate = Completer<void>()
          ..failNextQuoteStatus = 422
          ..failNextQuoteData = const {
            'error': {
              'code': 'PRICE_UNAVAILABLE',
              'message': 'selection price is not available',
            },
          };
        final dynamic state = tester.state(find.byType(VehicleDetailScreen));
        final Future<void> navigation = state.debugGoToQuoteResultForTesting(
          overrideIsLongRent: false,
        ) as Future<void>;
        for (var attempt = 0;
            attempt < 20 && interceptor.quoteBodies.length < 2;
            attempt++) {
          await tester.pump(const Duration(milliseconds: 10));
        }

        expect(interceptor.quoteBodies, hasLength(2));
        expect(interceptor.quoteBodies.last['product_type'], 'LEASE');
        await tester.pump(const Duration(milliseconds: 200));
        expect(_displayedAmount(443200), findsNothing);
        expect(find.text('리스 상담 신청하기'), findsOneWidget);

        interceptor.quoteGate!.complete();
        await navigation;
        await tester.pump(const Duration(milliseconds: 500));

        expect(find.byType(QuoteResultScreen), findsNothing);
        expect(_displayedAmount(443200), findsNothing);
        expect(
          find.text(QuoteApi.selectionPriceUnavailableMessage),
          findsWidgets,
        );
        expect(find.text('신청 화면을 준비하고 있어요'), findsNothing);
        expect(find.text('가격 확인 요청하기'), findsOneWidget);
      },
    );

    testWidgets('A and B late responses cannot overwrite the latest C trim', (
      tester,
    ) async {
      interceptor.details['vehicle-stale-trim'] = _vehicleDetailJson(
        vehicleId: 'vehicle-stale-trim',
        trimSelection: {
          'mode': 'FLAT',
          'default_vehicle_trim_id': 'trim-a',
          'groups': const [],
          'flat_grades': [
            _selectionLeaf('trim-a', '모던'),
            _selectionLeaf('trim-b', '인스퍼레이션', price: 35000000),
            _selectionLeaf('trim-c', 'GT', price: 38000000),
          ],
        },
        trims: [
          _legacyTrim('trim-a', '모던'),
          _legacyTrim('trim-b', '인스퍼레이션', price: 35000000),
          _legacyTrim('trim-c', 'GT', price: 38000000),
        ],
      );
      final firstQuote = Completer<Response<dynamic>>();
      final secondQuote = Completer<Response<dynamic>>();
      final thirdQuote = Completer<Response<dynamic>>();
      interceptor.pendingQuoteQueue.addAll([
        firstQuote,
        secondQuote,
        thirdQuote,
      ]);

      await tester.pumpWidget(
        const MaterialApp(
          home: VehicleDetailScreen(
            vehicleId: 'vehicle-stale-trim',
            initialMonthlyPayment: 111100,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      final firstRequest = interceptor.lastQuoteRequest!;

      await tester.tap(find.text('모던').first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));
      await tester.tap(find.text('인스퍼레이션'));
      await tester.pump();
      await tester.tap(find.widgetWithText(ElevatedButton, '선택 완료'));
      await tester.pump(const Duration(milliseconds: 350));
      expect(interceptor.quoteBodies, hasLength(2));
      final secondRequest = interceptor.lastQuoteRequest!;

      await tester.tap(find.text('인스퍼레이션').first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));
      await tester.tap(find.text('GT'));
      await tester.pump();
      await tester.tap(find.widgetWithText(ElevatedButton, '선택 완료'));
      await tester.pump(const Duration(milliseconds: 350));
      expect(interceptor.quoteBodies, hasLength(3));
      final thirdRequest = interceptor.lastQuoteRequest!;

      thirdQuote.complete(
        _quoteResponse(
          thirdRequest,
          vehicleId: 'vehicle-stale-trim',
          vehicleTrimId: 'trim-c',
          monthlyPayment: 331200,
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      secondQuote.complete(
        _quoteResponse(
          secondRequest,
          vehicleId: 'vehicle-stale-trim',
          vehicleTrimId: 'trim-b',
          monthlyPayment: 327800,
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      firstQuote.complete(
        _quoteResponse(
          firstRequest,
          vehicleId: 'vehicle-stale-trim',
          vehicleTrimId: 'trim-a',
          monthlyPayment: 315400,
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(_displayedAmount(331200), findsWidgets);
      expect(_displayedAmount(327800), findsNothing);
      expect(_displayedAmount(315400), findsNothing);
      expect(_requestedTrimId(interceptor.quoteBodies.last), 'trim-c');
    });

    testWidgets(
        'detail picker keeps FLAT leaves flat with the default selected', (
      tester,
    ) async {
      interceptor.details['vehicle-flat-detail'] = _vehicleDetailJson(
        vehicleId: 'vehicle-flat-detail',
        trimSelection: {
          'mode': 'FLAT',
          'default_vehicle_trim_id': 'trim-a',
          'groups': const [],
          'flat_grades': [
            _selectionLeaf('trim-a', '모던'),
            _selectionLeaf('trim-b', '인스퍼레이션', price: 35000000),
          ],
        },
        trims: [
          _legacyTrim('trim-a', '모던'),
          _legacyTrim('trim-b', '인스퍼레이션', price: 35000000),
        ],
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: VehicleDetailScreen(
            vehicleId: 'vehicle-flat-detail',
            initialMonthlyPayment: 443200,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.text('모던').first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('기본'), findsNothing);
      expect(find.text('모던'), findsWidgets);
      expect(find.text('인스퍼레이션'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('trim-selector-group-column')),
        findsNothing,
      );
      final flatGradeColumn = tester.getSize(
        find.byKey(const ValueKey('trim-selector-grade-column')),
      );
      expect(flatGradeColumn.width, greaterThan(500));
      final confirmBefore = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, '선택 완료'),
      );
      expect(confirmBefore.onPressed, isNotNull);

      await tester.tap(find.text('인스퍼레이션'));
      await tester.pump();
      final confirmAfter = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, '선택 완료'),
      );
      expect(confirmAfter.onPressed, isNotNull);
    });

    testWidgets('GROUPED renders seating groups and grades in server order', (
      tester,
    ) async {
      interceptor.details['vehicle-seating-order'] = _vehicleDetailJson(
        vehicleId: 'vehicle-seating-order',
        trimSelection: {
          'mode': 'GROUPED',
          'default_vehicle_trim_id': 'trim-5-cheap',
          'groups': [
            {
              'key': 'group-5',
              'name': '가솔린 2.5 2WD (5인승)',
              'min_price': 30000000,
              'grades': [
                _selectionLeaf(
                  'trim-5-cheap',
                  '트렌디',
                  modelSpec: '가솔린 2.5 2WD (5인승)',
                ),
                _selectionLeaf(
                  'trim-5-expensive',
                  '시그니처',
                  modelSpec: '가솔린 2.5 2WD (5인승)',
                  price: 34000000,
                ),
              ],
            },
            {
              'key': 'group-7',
              'name': '가솔린 2.5 2WD (7인승)',
              'min_price': 31000000,
              'grades': [
                _selectionLeaf(
                  'trim-7',
                  '프레스티지',
                  modelSpec: '가솔린 2.5 2WD (7인승)',
                  price: 31000000,
                ),
              ],
            },
            {
              'key': 'group-6',
              'name': '가솔린 2.5 2WD (6인승)',
              'min_price': 32000000,
              'grades': [
                _selectionLeaf(
                  'trim-6',
                  '프레스티지',
                  modelSpec: '가솔린 2.5 2WD (6인승)',
                  price: 32000000,
                ),
              ],
            },
          ],
          'flat_grades': const [],
        },
        trims: [
          _legacyTrim(
            'trim-5-cheap',
            '트렌디',
            modelSpec: '가솔린 2.5 2WD (5인승)',
          ),
          _legacyTrim(
            'trim-5-expensive',
            '시그니처',
            modelSpec: '가솔린 2.5 2WD (5인승)',
            price: 34000000,
          ),
          _legacyTrim(
            'trim-7',
            '프레스티지',
            modelSpec: '가솔린 2.5 2WD (7인승)',
            price: 31000000,
          ),
          _legacyTrim(
            'trim-6',
            '프레스티지',
            modelSpec: '가솔린 2.5 2WD (6인승)',
            price: 32000000,
          ),
        ],
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: VehicleDetailScreen(
            vehicleId: 'vehicle-seating-order',
            initialMonthlyPayment: 111100,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(
        find.textContaining('가솔린 2.5 2WD (5인승) 트렌디').first,
      );
      await tester.pump(const Duration(milliseconds: 300));

      final group5 = tester.getTopLeft(
        find.byKey(const ValueKey('trim-selector-group-group-5')),
      );
      final group7 = tester.getTopLeft(
        find.byKey(const ValueKey('trim-selector-group-group-7')),
      );
      final group6 = tester.getTopLeft(
        find.byKey(const ValueKey('trim-selector-group-group-6')),
      );
      expect(group5.dy, lessThan(group7.dy));
      expect(group7.dy, lessThan(group6.dy));
      final cheap = tester.getTopLeft(
        find.byKey(const ValueKey('trim-selector-grade-trim-5-cheap')),
      );
      final expensive = tester.getTopLeft(
        find.byKey(const ValueKey('trim-selector-grade-trim-5-expensive')),
      );
      expect(cheap.dy, lessThan(expensive.dy));
      expect(find.textContaining('(5인승)'), findsWidgets);
      expect(find.textContaining('(6인승)'), findsWidgets);
      expect(find.textContaining('(7인승)'), findsWidgets);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'GROUPED detail picker selects the cheapest grade when the group changes',
      (tester) async {
        await tester.binding.setSurfaceSize(const Size(320, 844));
        addTearDown(() async {
          await tester.binding.setSurfaceSize(null);
        });
        interceptor.details['vehicle-group-switch'] = _vehicleDetailJson(
          vehicleId: 'vehicle-group-switch',
          trimSelection: {
            'mode': 'GROUPED',
            'groups': [
              {
                'key': 'gas',
                'name': '가솔린 1.6',
                'grades': [
                  _selectionLeaf('trim-a', '모던', modelSpec: '가솔린 1.6'),
                ],
              },
              {
                'key': 'hybrid',
                'name': '하이브리드 1.6',
                'grades': [
                  _selectionLeaf(
                    'trim-b',
                    '아주 긴 시그니처 인스퍼레이션',
                    modelSpec: '하이브리드 1.6',
                    price: 39000000,
                  ),
                ],
              },
            ],
            'flat_grades': const [],
          },
          trims: [
            _legacyTrim('trim-a', '모던', modelSpec: '가솔린 1.6'),
            _legacyTrim(
              'trim-b',
              '아주 긴 시그니처 인스퍼레이션',
              modelSpec: '하이브리드 1.6',
              price: 39000000,
              description: '좁은 화면에서도 가격과 함께 표시되어야 하는 실제 사양 설명',
            ),
          ],
          danawaTrims: const [
            {
              'name': '레거시 다나와 트림',
              'grades': [
                {
                  'id': 'danawa-grade',
                  'name': '레거시 다나와 등급',
                  'base_price': 99999999,
                  'options': [],
                },
              ],
            },
          ],
        );

        await tester.pumpWidget(
          const MaterialApp(
            home: VehicleDetailScreen(
              vehicleId: 'vehicle-group-switch',
              initialTrimId: 'trim-a',
              initialMonthlyPayment: 443200,
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));

        expect(find.textContaining('가솔린 1.6 모던'), findsWidgets);
        expect(find.text('레거시 다나와 등급'), findsNothing);
        await tester.tap(find.textContaining('가솔린 1.6 모던').first);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));

        final trimColumn = tester.getSize(
          find.byKey(const ValueKey('trim-selector-group-column')),
        );
        final gradeColumn = tester.getSize(
          find.byKey(const ValueKey('trim-selector-grade-column')),
        );
        expect(trimColumn.width, lessThan(gradeColumn.width));
        expect(
          find.byKey(const ValueKey('trim-selector-group-gas')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('trim-selector-group-hybrid')),
          findsOneWidget,
        );

        await tester.tap(find.text('하이브리드 1.6'));
        await tester.pump();
        final confirmAfterGroupChange = tester.widget<ElevatedButton>(
          find.widgetWithText(ElevatedButton, '선택 완료'),
        );
        expect(confirmAfterGroupChange.onPressed, isNotNull);
        expect(tester.takeException(), isNull);
        await tester.tap(find.widgetWithText(ElevatedButton, '선택 완료'));
        await tester.pump(const Duration(milliseconds: 300));
        expect(_requestedTrimId(interceptor.quoteBodies.last), 'trim-b');
        expect(tester.takeException(), isNull);

        await tester.pumpWidget(
          const MaterialApp(
            home: VehicleDetailScreen(
              vehicleId: 'vehicle-group-switch',
              initialMonthlyPayment: 443200,
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        expect(_requestedTrimId(interceptor.quoteBodies.last), 'trim-b');
        expect(
          find.textContaining('하이브리드 1.6 아주 긴 시그니처 인스퍼레이션'),
          findsWidgets,
        );
      },
    );

    testWidgets(
      'legacy Danawa picker uses the same two-column trim and grade UI',
      (tester) async {
        final legacyDetail = _vehicleDetailJson(
          vehicleId: 'vehicle-danawa-two-column',
          trimSelection: const {},
          danawaTrims: const [
            {
              'name': '가솔린 1.6 터보 2WD',
              'grades': [
                {
                  'id': 'danawa-2wd-modern',
                  'name': '모던',
                  'base_price': 30460000,
                  'options': [],
                },
              ],
            },
            {
              'name': '가솔린 1.6 터보 4WD',
              'grades': [
                {
                  'id': 'danawa-4wd-n-line',
                  'name': 'N Line',
                  'base_price': 37430000,
                  'options': [],
                },
                {
                  'id': 'danawa-4wd-inspiration',
                  'name': '인스퍼레이션',
                  'base_price': 36580000,
                  'options': [],
                },
              ],
            },
          ],
        )..remove('trim_selection');
        interceptor.details['vehicle-danawa-two-column'] = legacyDetail;

        await tester.pumpWidget(
          const MaterialApp(
            home: VehicleDetailScreen(
              vehicleId: 'vehicle-danawa-two-column',
              initialMonthlyPayment: 443200,
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));

        await tester.tap(find.text('가솔린 1.6 터보 2WD · 모던'));
        await tester.pumpAndSettle();

        final trimColumn = tester.getSize(
          find.byKey(const ValueKey('danawa-trim-selector-group-column')),
        );
        final gradeColumn = tester.getSize(
          find.byKey(const ValueKey('danawa-trim-selector-grade-column')),
        );
        expect(trimColumn.width, lessThan(gradeColumn.width));
        expect(find.text('가솔린 1.6 터보 2WD'), findsOneWidget);
        expect(find.text('가솔린 1.6 터보 4WD'), findsOneWidget);
        expect(find.text('모던'), findsOneWidget);

        await tester.tap(find.text('가솔린 1.6 터보 4WD'));
        await tester.pump();
        expect(find.text('N Line'), findsOneWidget);
        expect(find.text('인스퍼레이션'), findsOneWidget);
        expect(
          tester
              .widget<ElevatedButton>(
                find.widgetWithText(ElevatedButton, '선택 완료'),
              )
              .onPressed,
          isNotNull,
        );
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets('server-hidden Seltos legacy selection is reset safely', (
      tester,
    ) async {
      interceptor.details['vehicle-seltos-cache'] = _vehicleDetailJson(
        vehicleId: 'vehicle-seltos-cache',
        brand: '기아',
        modelName: '셀토스',
        trimSelection: {
          'mode': 'GROUPED',
          'default_vehicle_trim_id': 'seltos-current-grade',
          'groups': [
            {
              'key': 'seltos-current',
              'name': '가솔린 1.6 터보 2WD',
              'grades': [
                _selectionLeaf(
                  'seltos-current-grade',
                  '시그니처',
                  modelSpec: '가솔린 1.6 터보 2WD',
                ),
              ],
            },
          ],
          'flat_grades': const [],
        },
        trims: [
          _legacyTrim(
            'seltos-hidden-26my',
            '(26각자) 트렌디',
            modelSpec: '(26각자) 가솔린 1.6 터보 2WD',
          ),
          _legacyTrim(
            'seltos-current-grade',
            '시그니처',
            modelSpec: '가솔린 1.6 터보 2WD',
          ),
        ],
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: VehicleDetailScreen(
            vehicleId: 'vehicle-seltos-cache',
            initialTrimId: 'seltos-hidden-26my',
            initialMonthlyPayment: 443200,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.textContaining('가솔린 1.6 터보 2WD 시그니처'), findsWidgets);
      expect(find.textContaining('26각자'), findsNothing);
      expect(_requestedTrimId(interceptor.quoteBodies.first),
          'seltos-current-grade');
      await tester.tap(
        find.textContaining('가솔린 1.6 터보 2WD 시그니처').first,
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.textContaining('26각자'), findsNothing);
      expect(find.text('시그니처'), findsOneWidget);
    });

    testWidgets(
      'repricing failure blocks submit and can retry the same grade',
      (tester) async {
        interceptor.details['vehicle-retry'] = _vehicleDetailJson(
          vehicleId: 'vehicle-retry',
          trimSelection: {
            'mode': 'GROUPED',
            'groups': [
              {
                'key': 'gas',
                'name': '가솔린 1.6',
                'grades': [
                  _selectionLeaf('trim-a', '모던', modelSpec: '가솔린 1.6'),
                  _selectionLeaf(
                    'trim-b',
                    '인스퍼레이션',
                    modelSpec: '가솔린 1.6',
                    price: 35000000,
                  ),
                ],
              },
            ],
            'flat_grades': const [],
          },
        );

        await _pumpQuote(
          tester,
          vehicleId: 'vehicle-retry',
          vehicleTrimId: 'trim-a',
          selectedOptionsSummary: '모던 전용 옵션',
          selectedExteriorColorName: '모던 전용 외장색',
          selectedInteriorColorName: '모던 전용 내장색',
        );
        interceptor.failNextQuote = true;

        await _openQuoteTrimGradeSheet(tester);
        await tester.tap(find.text('인스퍼레이션'));
        await tester.pump();
        await tester.tap(find.widgetWithText(FilledButton, '선택 완료'));
        await tester.pumpAndSettle();

        expect(
          find.textContaining('월 납입료를 다시 확인하지 못했어요'),
          findsWidgets,
        );
        expect(
          find.byKey(const ValueKey('quote-trim-pricing-notice')),
          findsOneWidget,
        );
        await tester.drag(
          find.byType(ListView).first,
          const Offset(0, -320),
        );
        await tester.pumpAndSettle();
        expect(find.text('모던 전용 옵션'), findsNothing);
        expect(find.text('모던 전용 외장색'), findsNothing);
        expect(find.text('모던 전용 내장색'), findsNothing);
        expect(find.text('추가 옵션 없음'), findsOneWidget);
        final failedCta = tester.widget<InkWell>(
          find.ancestor(
            of: find.text('이 조건으로 자세한 분석 받기'),
            matching: find.byType(InkWell),
          ),
        );
        expect(failedCta.onTap, isNull);

        await tester.drag(find.byType(ListView).first, const Offset(0, 600));
        await tester.pumpAndSettle();
        await _openQuoteTrimGradeSheet(tester);
        await tester.tap(find.text('인스퍼레이션').last);
        await tester.pump();
        await tester.tap(find.widgetWithText(FilledButton, '선택 완료'));
        await tester.pumpAndSettle();

        expect(interceptor.quoteBodies, hasLength(2));
        final recoveredCta = tester.widget<InkWell>(
          find.ancestor(
            of: find.text('이 조건으로 자세한 분석 받기'),
            matching: find.byType(InkWell),
          ),
        );
        expect(recoveredCta.onTap, isNotNull);
      },
    );

    testWidgets(
      'rate limited and unresolved reference repricing clear stale proof',
      (tester) async {
        interceptor.details['vehicle-rate-limited'] = _vehicleDetailJson(
          vehicleId: 'vehicle-rate-limited',
          trimSelection: {
            'mode': 'GROUPED',
            'groups': [
              {
                'key': 'gas',
                'name': '가솔린 1.6',
                'grades': [
                  _selectionLeaf('trim-a', '모던', modelSpec: '가솔린 1.6'),
                  _selectionLeaf(
                    'trim-b',
                    '인스퍼레이션',
                    modelSpec: '가솔린 1.6',
                    price: 35000000,
                  ),
                ],
              },
            ],
            'flat_grades': const [],
          },
        );

        await _pumpQuote(
          tester,
          vehicleId: 'vehicle-rate-limited',
          vehicleTrimId: 'trim-a',
        );
        expect(
          find.byKey(const ValueKey('quote-condition-payment-card')),
          findsNothing,
        );
        interceptor.failNextQuoteStatus = 429;

        await _openQuoteTrimGradeSheet(tester);
        await tester.tap(find.text('인스퍼레이션'));
        await tester.pump();
        await tester.tap(find.widgetWithText(FilledButton, '선택 완료'));
        await tester.pumpAndSettle();

        expect(_displayedAmount(443200), findsNothing);
        expect(
          find.byKey(const ValueKey('quote-trim-pricing-notice')),
          findsOneWidget,
        );
        expect(
          find.text('월 납입료를 다시 확인하지 못했어요. 다시 시도해 주세요.'),
          findsWidgets,
        );
        final failedCta = tester.widget<InkWell>(
          find.ancestor(
            of: find.text('이 조건으로 자세한 분석 받기'),
            matching: find.byType(InkWell),
          ),
        );
        expect(failedCta.onTap, isNull);

        await _openQuoteTrimGradeSheet(tester);
        await tester.tap(find.text('인스퍼레이션').last);
        await tester.pump();
        await tester.tap(find.widgetWithText(FilledButton, '선택 완료'));
        await tester.pumpAndSettle();

        expect(interceptor.quoteBodies, hasLength(2));
        final recoveredCta = tester.widget<InkWell>(
          find.ancestor(
            of: find.text('이 조건으로 자세한 분석 받기'),
            matching: find.byType(InkWell),
          ),
        );
        expect(recoveredCta.onTap, isNotNull);

        interceptor
          ..failNextQuoteStatus = 422
          ..failNextQuoteData = const {
            'detail': {
              'code': 'REFERENCE_PRICE_UNRESOLVED',
              'message': 'reference market price could not be resolved',
            },
          };

        await tester.drag(find.byType(ListView).first, const Offset(0, 600));
        await tester.pumpAndSettle();
        await _openQuoteTrimGradeSheet(tester);
        await tester.tap(find.text('모던').last);
        await tester.pump();
        await tester.tap(find.widgetWithText(FilledButton, '선택 완료'));
        await tester.pumpAndSettle();

        expect(_displayedAmount(443200), findsNothing);
        expect(
          find.byKey(const ValueKey('quote-trim-pricing-notice')),
          findsOneWidget,
        );
        expect(
          find.text(QuoteApi.selectionPriceUnavailableMessage),
          findsWidgets,
        );
        final unresolvedCta = tester.widget<InkWell>(
          find.ancestor(
            of: find.text('이 조건으로 자세한 분석 받기'),
            matching: find.byType(InkWell),
          ),
        );
        expect(unresolvedCta.onTap, isNull);

        await tester.drag(find.byType(ListView).first, const Offset(0, 600));
        await tester.pumpAndSettle();
        await _openQuoteTrimGradeSheet(tester);
        await tester.tap(find.text('모던').last);
        await tester.pump();
        await tester.tap(find.widgetWithText(FilledButton, '선택 완료'));
        await tester.pumpAndSettle();

        expect(interceptor.quoteBodies, hasLength(4));
        final finalRecoveredCta = tester.widget<InkWell>(
          find.ancestor(
            of: find.text('이 조건으로 자세한 분석 받기'),
            matching: find.byType(InkWell),
          ),
        );
        expect(finalRecoveredCta.onTap, isNotNull);
      },
    );

    testWidgets('submission locks trim selection and snapshots one trim', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({});
      await AuthSession.instance.setSession(
        accessToken: 'trim-test-token',
        user: const AuthUser(
          id: 'user-1',
          email: 'trim@example.com',
          fullName: '트림 테스터',
          phoneNumber: null,
          role: 'CUSTOMER',
          isActive: true,
        ),
      );
      addTearDown(AuthSession.instance.clear);
      interceptor.details['vehicle-submit-lock'] = _vehicleDetailJson(
        vehicleId: 'vehicle-submit-lock',
        trimSelection: {
          'mode': 'FLAT',
          'groups': const [],
          'flat_grades': [
            _selectionLeaf('trim-a', '모던'),
            _selectionLeaf('trim-b', '인스퍼레이션'),
          ],
        },
      );
      interceptor.pendingApplication = Completer<Response<dynamic>>();

      await _pumpQuote(
        tester,
        vehicleId: 'vehicle-submit-lock',
        vehicleTrimId: 'trim-a',
      );
      await tester.tap(find.text('이 조건으로 자세한 분석 받기'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(interceptor.applicationBodies.single['vehicle_trim_id'], 'trim-a');
      expect(
        find.ancestor(
          of: find.byKey(const ValueKey('quote-trim-grade-row')),
          matching: find.byType(InkWell),
        ),
        findsNothing,
      );

      interceptor.pendingApplication!.complete(
        _applicationResponse(
          interceptor.lastApplicationRequest!,
          vehicleId: 'vehicle-submit-lock',
          vehicleTrimId: 'trim-a',
        ),
      );
      await tester.pumpAndSettle();
    });

    testWidgets('TestFlight option and condition rows remain visible', (
      tester,
    ) async {
      interceptor.details['vehicle-layout'] = _vehicleDetailJson(
        vehicleId: 'vehicle-layout',
        trimSelection: {
          'mode': 'UNAVAILABLE',
          'groups': const [],
          'flat_grades': const [],
          'unavailable_message': '세부 등급 정보 준비 중',
        },
      );

      await _pumpQuote(
        tester,
        vehicleId: 'vehicle-layout',
        selectedOptionsSummary: '컴포트 패키지',
        selectedExteriorColorName: '아틀라스 화이트',
        selectedInteriorColorName: '블랙',
        securityDeposit: 0,
        insuranceLimit: '1억원',
      );

      await tester.drag(find.byType(ListView).first, const Offset(0, -520));
      await tester.pumpAndSettle();
      expect(find.text('외장색상'), findsOneWidget);
      expect(find.text('아틀라스 화이트'), findsOneWidget);
      expect(find.text('내장색상'), findsOneWidget);
      expect(find.text('컴포트 패키지'), findsOneWidget);
      await tester.drag(find.byType(ListView).first, const Offset(0, -500));
      await tester.pumpAndSettle();
      expect(find.text('보증금'), findsOneWidget);
      expect(find.text('대물보험'), findsOneWidget);
      expect(find.text('1억원'), findsOneWidget);
    });
  });
}

Future<void> _scrollQuoteTrimGradeRowIntoView(WidgetTester tester) async {
  final row = find.byKey(const ValueKey('quote-trim-grade-row'));
  expect(row, findsOneWidget);
  await Scrollable.ensureVisible(
    tester.element(row),
    alignment: 0.35,
    duration: Duration.zero,
  );
  await tester.pumpAndSettle();
}

Future<void> _openQuoteTrimGradeSheet(WidgetTester tester) async {
  await _scrollQuoteTrimGradeRowIntoView(tester);
  await tester.tap(find.byKey(const ValueKey('quote-trim-grade-row')));
  await tester.pumpAndSettle();
}

Future<void> _pumpQuote(
  WidgetTester tester, {
  required String vehicleId,
  String? vehicleTrimId,
  String? selectedOptionsSummary,
  String? selectedExteriorColorName,
  String? selectedInteriorColorName,
  int? securityDeposit,
  String? insuranceLimit,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: QuoteResultScreen(
        quote: _quote(vehicleId, vehicleTrimId: vehicleTrimId),
        vehicleName: '코나',
        vehicleBrand: '현대',
        vehicleTrimId: vehicleTrimId,
        selectedOptionsSummary: selectedOptionsSummary,
        selectedExteriorColorName: selectedExteriorColorName,
        selectedInteriorColorName: selectedInteriorColorName,
        securityDeposit: securityDeposit,
        insuranceLimit: insuranceLimit,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

QuoteEnvelope _quote(
  String vehicleId, {
  String? vehicleTrimId,
  int deposit = 0,
  int vehiclePrice = 35000000,
  bool? trimPricingApplied,
  String? trimPricingStatus,
  String? pricingBasis = 'CHAZM_IMPORTED',
  bool? marketPricingApplied,
  String? priceSource = 'CHAZM_IMPORTED',
}) {
  final hasTrim = vehicleTrimId != null;
  final displayAdjustment = hasTrim ? (deposit > 0 ? 40000 : 30000) : 0;
  return QuoteEnvelope(
    traceId: 'trace',
    data: QuoteData(
      tier: 'STANDARD',
      vehicleId: vehicleId,
      term: 60,
      deposit: deposit,
      mileageLimit: 10000,
      monthlyPayment: 443200,
      otdTotal: 35000000,
      vehiclePrice: vehiclePrice,
      residualValue: 15000000,
      residualPct: 0.42,
      promoDiscount: 0,
      estimatedDiscount: 0,
      estimatedTaxes: 0,
      breakdown: const [],
      vehicleTrimId: vehicleTrimId,
      trimPricingApplied: trimPricingApplied ?? (hasTrim ? true : null),
      trimPricingStatus: trimPricingStatus ??
          (hasTrim ? 'MARKET_PRICE_APPLIED' : 'NOT_REQUESTED'),
      pricingBasis: hasTrim ? pricingBasis : null,
      marketPricingApplied: marketPricingApplied ?? hasTrim,
      priceSource: hasTrim ? priceSource : null,
      baseMonthlyPayment: hasTrim ? 443200 - displayAdjustment : null,
      displayAdjustment: displayAdjustment,
    ),
  );
}

Map<String, dynamic> _vehicleDetailJson({
  required String vehicleId,
  required Map<String, dynamic> trimSelection,
  List<Map<String, dynamic>> trims = const [],
  List<Map<String, dynamic>> danawaTrims = const [],
  String brand = '현대',
  String modelName = '코나',
}) {
  return {
    'id': vehicleId,
    'brand': brand,
    'model_name': modelName,
    'segment': 'suv',
    'fuel': 'gas',
    'year': 2026,
    'base_price': 35000000,
    'is_published': true,
    'trims': trims,
    'options': const [],
    'danawa_trims': danawaTrims,
    'danawa_colors': const [],
    'trim_selection': trimSelection,
  };
}

Map<String, dynamic> _selectionLeaf(
  String id,
  String name, {
  String? modelSpec,
  int price = 30000000,
}) {
  return {
    'vehicle_trim_id': id,
    'name': name,
    'model_spec': modelSpec,
    'display_name': name,
    'base_price': price,
    'is_active': true,
  };
}

Map<String, dynamic> _legacyTrim(
  String id,
  String name, {
  String? modelSpec,
  int price = 30000000,
  bool isAvailable = true,
  String? description,
}) {
  return {
    'id': id,
    'name': name,
    'model_spec': modelSpec,
    'display_order': 0,
    'price': price,
    'is_available': isAvailable,
    'description': description,
    'options': const [],
    'colors': const [],
  };
}

Response<dynamic> _quoteResponse(
  RequestOptions request, {
  required String vehicleId,
  String? vehicleTrimId,
  int monthlyPayment = 443200,
  String selectionContractVersion = QuoteSelection.contractVersion,
}) {
  final requestBody = request.data is Map
      ? Map<String, dynamic>.from(request.data as Map)
      : const <String, dynamic>{};
  final requestSelection = requestBody['selection'] is Map
      ? Map<String, dynamic>.from(requestBody['selection'] as Map)
      : null;
  final normalizedSelection = requestSelection == null
      ? null
      : QuoteSelection.fromJson(requestSelection).toJson();
  if (vehicleTrimId != null && normalizedSelection != null) {
    normalizedSelection['vehicle_trim_id'] = vehicleTrimId;
  }
  final resolvedTrimId =
      vehicleTrimId ?? (normalizedSelection?['vehicle_trim_id'] as String?);
  final deposit = (requestBody['deposit'] as num?)?.round() ?? 0;
  final guarantee = (requestBody['guarantee'] as num?)?.round() ?? 0;
  final displayAdjustment = resolvedTrimId == null
      ? 0
      : deposit > 0
          ? 40000
          : 30000;
  final selectedVehiclePrice = resolvedTrimId == null ? 35000000 : 42000000;
  final selectionFingerprint = normalizedSelection == null
      ? null
      : 'fingerprint:${QuoteSelection.fromJson(normalizedSelection).identifierKey}:'
          '${requestBody['term']}:${requestBody['mileage_limit']}:$deposit:$guarantee';
  return Response<dynamic>(
    requestOptions: request,
    statusCode: 200,
    data: {
      'data': {
        'tier': 'STANDARD',
        'vehicle_id': vehicleId,
        'term': requestBody['term'] ?? 60,
        'deposit': deposit,
        'mileage_limit': requestBody['mileage_limit'] ?? 10000,
        'monthly_payment': monthlyPayment,
        'otd_total': 35000000,
        'vehicle_price': 35000000,
        'residual_value': 15000000,
        'residual_pct': 0.42,
        'promo_discount': 0,
        'estimated_discount': 0,
        'estimated_taxes': 0,
        'breakdown': const [],
        if (resolvedTrimId != null) 'vehicle_trim_id': resolvedTrimId,
        'selection_mode': 'FLAT',
        'grade_name': '프레스티지',
        'vehicle_trim_base_price': 35000000,
        'trim_pricing_applied': resolvedTrimId != null,
        'trim_pricing_status':
            resolvedTrimId != null ? 'MARKET_PRICE_APPLIED' : 'NOT_REQUESTED',
        if (resolvedTrimId != null) 'pricing_basis': 'CHAZM_IMPORTED',
        if (resolvedTrimId != null) 'market_pricing_applied': true,
        if (resolvedTrimId != null) 'source': 'CHAZM_IMPORTED',
        if (resolvedTrimId != null) 'price_source': 'CHAZM_IMPORTED',
        if (resolvedTrimId != null)
          'base_monthly_payment': monthlyPayment - displayAdjustment,
        if (resolvedTrimId != null) 'display_adjustment': displayAdjustment,
        if (resolvedTrimId != null) 'monthly_payment_before_lift': 403200,
        if (normalizedSelection != null) ...{
          'selection_contract_version': selectionContractVersion,
          'normalized_selection': normalizedSelection,
          'selection_fingerprint': selectionFingerprint,
          'pricing_context_version': 'test-pricing-v1',
          'reference_vehicle_price': 35000000,
          'reference_vehicle_trim_id': resolvedTrimId,
          'selected_vehicle_price': selectedVehiclePrice,
          'base_trim_price': selectedVehiclePrice,
          'option_total': 0,
          'exterior_color_price': 0,
          'interior_color_price': 0,
          'verified_discount': 0,
          'market_base_monthly_raw': monthlyPayment - displayAdjustment,
          'reference_finance_monthly_raw': 400000,
          'selected_finance_monthly_raw': 400000,
          'selection_monthly_delta': 0,
          'guarantee': guarantee,
          'prepayment_pct': requestBody['prepayment_pct'] ?? 0,
          'guarantee_pct': requestBody['guarantee_pct'] ?? 0,
          'price_provenance': {
            'version': 'price_provenance_v1',
            'processed_product_type': requestBody['product_type'] ?? 'RENTAL',
            'request_conditions_verified': true,
            'sales_ai_eligible': true,
            'unsupported_reasons': [],
            'market_price': {
              'product_type': requestBody['product_type'] ?? 'RENTAL',
              'match_status': 'EXACT',
              'vehicle_match': 'EXACT',
              'applied_conditions': {
                'term_months': requestBody['term'] ?? 60,
                'annual_km': requestBody['mileage_limit'] ?? 10000,
                'prepayment_pct': requestBody['prepayment_pct'] ?? 0,
              },
              'condition_match': {
                'term_months': 'EXACT',
                'annual_km': 'EXACT',
                'prepayment_pct': 'EXACT',
              },
              'unknown_reasons': [],
            },
          },
        },
      },
      'meta': {'trace_id': 'quote-trace'},
    },
  );
}

String? _requestedTrimId(Map<String, dynamic> body) {
  final selection = body['selection'];
  if (selection is! Map) return body['vehicle_trim_id'] as String?;
  return selection['vehicle_trim_id'] as String?;
}

Finder _displayedAmount(int amount) {
  final formatted = amount.toString().replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (_) => ',',
      );
  return find.byWidgetPredicate((widget) =>
      widget is RollingMoneyText && widget.amount == amount ||
      widget is Text && (widget.data?.contains(formatted) ?? false));
}

Response<dynamic> _applicationResponse(
  RequestOptions request, {
  required String vehicleId,
  String? vehicleTrimId,
}) {
  return Response<dynamic>(
    requestOptions: request,
    statusCode: 200,
    data: {
      'data': {
        'id': 'application-1',
        'user_id': 'user-1',
        'vehicle_id': vehicleId,
        'vehicle_trim_id': vehicleTrimId,
        'status': 'DRAFT',
      },
      'meta': {'trace_id': 'application-trace'},
    },
  );
}

class _TrimSelectionInterceptor extends Interceptor {
  final Map<String, Map<String, dynamic>> details = {};
  final List<Map<String, dynamic>> quoteBodies = [];
  final List<Map<String, dynamic>> applicationBodies = [];
  final List<Map<String, dynamic>> inquiryBodies = [];
  Completer<Map<String, dynamic>>? pendingDetail;
  Completer<Response<dynamic>>? pendingQuote;
  final List<Completer<Response<dynamic>>> pendingQuoteQueue = [];
  Completer<Response<dynamic>>? pendingApplication;
  bool failNextQuote = false;
  int? failNextQuoteStatus;
  Map<String, dynamic>? failNextQuoteData;
  Completer<void>? quoteGate;
  RequestOptions? lastQuoteRequest;
  RequestOptions? lastApplicationRequest;

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (options.path == '/api/v1/support/quote-inquiries') {
      inquiryBodies.add(Map<String, dynamic>.from(options.data as Map));
      handler.resolve(Response(requestOptions: options, statusCode: 201,
          data: {'id': 'mock-price-check-request'}));
      return;
    }
    if (options.method == 'GET' && options.uri.path == '/api/v1/vehicles/') {
      handler.resolve(
          Response<dynamic>(requestOptions: options, statusCode: 200, data: {
        'items': details.values
            .map((detail) => {
                  ...detail,
                    'price_from': detail['base_price'],
                  'available_product_types': ['RENTAL', 'LEASE'],
                  'displayed_product_type': 'RENTAL',
                })
            .toList(),
        'total': details.length,
        'page': 1,
        'size': 100,
        'pages': 1,
      }));
      return;
    }
    final detailMatch = RegExp(
      r'^/api/v1/vehicles/([^/]+)$',
    ).firstMatch(options.uri.path);
    if (options.method == 'GET' && detailMatch != null) {
      final pending = pendingDetail;
      if (pending != null && !pending.isCompleted) {
        handler.resolve(
          Response<dynamic>(
            requestOptions: options,
            statusCode: 200,
            data: await pending.future,
          ),
        );
        return;
      }
      final detail = details[detailMatch.group(1)];
      if (detail != null) {
        handler.resolve(
          Response<dynamic>(
            requestOptions: options,
            statusCode: 200,
            data: detail,
          ),
        );
        return;
      }
    }
    if (options.method == 'GET' &&
        RegExp(r'^/api/v1/vehicles/[^/]+/quotes$').hasMatch(options.uri.path)) {
      handler.resolve(
        Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: const [
            {
              'id': 'capital-test',
              'finance_company': 'test_capital',
              'finance_company_kr': '테스트캐피탈',
              'contract_months': 60,
              'prepay_pct': 0,
              'annual_km': 10000,
              'monthly_payment': 500000,
              'residual_value': 15000000,
              'residual_ratio': 0.42,
              'product_type': 'RENTAL',
            },
          ],
        ),
      );
      return;
    }
    if (options.method == 'POST' &&
        options.uri.path == '/api/v1/quotes/instant') {
      final body = Map<String, dynamic>.from(options.data as Map);
      quoteBodies.add(body);
      lastQuoteRequest = options;
      final gate = quoteGate;
      if (gate != null) {
        await gate.future;
        quoteGate = null;
      }
      final forcedStatus = failNextQuoteStatus ?? (failNextQuote ? 500 : null);
      if (forcedStatus != null) {
        final forcedData = failNextQuoteData;
        failNextQuote = false;
        failNextQuoteStatus = null;
        failNextQuoteData = null;
        handler.reject(
          DioException(
            requestOptions: options,
            response: Response<dynamic>(
              requestOptions: options,
              statusCode: forcedStatus,
              data: forcedData ?? const {'detail': 'forced quote failure'},
            ),
            type: DioExceptionType.badResponse,
          ),
        );
        return;
      }
      if (pendingQuoteQueue.isNotEmpty) {
        final queued = pendingQuoteQueue.removeAt(0);
        handler.resolve(await queued.future);
        return;
      }
      final pending = pendingQuote;
      if (pending != null && !pending.isCompleted) {
        handler.resolve(await pending.future);
        return;
      }
      handler.resolve(
        _quoteResponse(
          options,
          vehicleId: body['vehicle_id'] as String,
          vehicleTrimId: _requestedTrimId(body),
        ),
      );
      return;
    }
    if (options.method == 'POST' &&
        options.uri.path == '/api/v1/applications') {
      final body = Map<String, dynamic>.from(options.data as Map);
      applicationBodies.add(body);
      lastApplicationRequest = options;
      final pending = pendingApplication;
      if (pending != null && !pending.isCompleted) {
        handler.resolve(await pending.future);
        return;
      }
      handler.resolve(
        _applicationResponse(
          options,
          vehicleId: body['vehicle_id'] as String,
          vehicleTrimId: body['vehicle_trim_id'] as String?,
        ),
      );
      return;
    }
    handler.next(options);
  }
}
