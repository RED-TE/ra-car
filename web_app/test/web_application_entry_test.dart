import 'dart:async';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/models/application.dart';
import 'package:recar_app/models/auth.dart';
import 'package:recar_app/models/quote.dart';
import 'package:recar_app/screens/applicant_type_selection_screen.dart';
import 'package:recar_app/screens/quote_result_screen.dart';
import 'package:recar_app/services/api_client.dart';
import 'package:recar_app/services/auth_session.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('browser supports secure replacement request keys', () {
    expect(() => Random.secure().nextInt(0x100000000), returnsNormally);
  });

  group('web document entry preserves active applications', () {
    late _ReplacementFlowInterceptor interceptor;

    setUp(() async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      await AuthSession.instance.setSession(
        accessToken: 'replacement-test-token',
        user: const AuthUser(
          id: 'user-replacement',
          email: 'replacement@example.com',
          fullName: '교체 테스트',
          phoneNumber: null,
          role: 'CUSTOMER',
          isActive: true,
        ),
      );
      interceptor = _ReplacementFlowInterceptor();
      ApiClient.dio.interceptors.insert(0, interceptor);
    });

    tearDown(() async {
      ApiClient.dio.interceptors.remove(interceptor);
      await AuthSession.instance.clear();
    });

    testWidgets('replaceable draft shows confirmation and cancel changes none',
        (tester) async {
      await _pumpQuote(tester);
      await _tapSubmit(tester);

      expect(find.text('새 신청을 시작할까요?'), findsOneWidget);
      expect(
        find.text('작성 중인 임시 신청은 정리하고 새 차량 신청을 시작해요.'),
        findsOneWidget,
      );
      expect(
        find.text('이미 심사가 시작된 신청과 발송된 견적은 그대로 유지돼요.'),
        findsOneWidget,
      );
      expect(find.text('새롭게 진행하기'), findsOneWidget);

      await tester.tap(find.text('돌아가기'));
      await tester.pumpAndSettle();

      expect(interceptor.replaceBodies, isEmpty);
      expect(find.byType(QuoteResultScreen), findsOneWidget);
    });

    testWidgets('confirmed replacement opens next step with new application id',
        (tester) async {
      await _pumpQuote(tester);
      await _tapSubmit(tester);
      await tester.tap(find.text('새롭게 진행하기'));
      await tester.pumpAndSettle();

      expect(interceptor.createCalls, 1);
      expect(interceptor.replaceBodies, hasLength(1));
      expect(interceptor.replaceBodies.single['user_confirmed'], isTrue);
      expect(
        interceptor.replaceBodies.single.containsKey('application_ids'),
        isFalse,
      );
      expect(
        interceptor.replaceBodies.single['idempotency_key'],
        isA<String>()
            .having((value) => value.length, 'length', greaterThan(15)),
      );
      final screen = tester.widget<ApplicantTypeSelectionScreen>(
        find.byType(ApplicantTypeSelectionScreen),
      );
      expect(screen.application.data.id, 'replacement-application-1');
    });

    testWidgets('replacement request stays single while CTA is pending',
        (tester) async {
      interceptor.pendingReplacement = Completer<Response<dynamic>>();
      await _pumpQuote(tester);
      await _tapSubmit(tester);
      await tester.tap(find.text('새롭게 진행하기'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(interceptor.replaceBodies, hasLength(1));
      expect(find.text('새롭게 진행하기'), findsNothing);
      await tester.pump(const Duration(milliseconds: 300));
      expect(interceptor.replaceBodies, hasLength(1));

      interceptor.pendingReplacement!.complete(
        _applicationResponse(
          interceptor.lastReplacementRequest!,
          applicationId: 'replacement-application-1',
        ),
      );
      await tester.pumpAndSettle();

      expect(interceptor.replaceBodies, hasLength(1));
      expect(find.byType(ApplicantTypeSelectionScreen), findsOneWidget);
    });

    testWidgets('protected application can start new without replacing history',
        (tester) async {
      interceptor.createErrorCode = 'APPLICATION_REPLACEMENT_BLOCKED';
      await _pumpQuote(tester);
      await _tapSubmit(tester);
      await tester.pumpAndSettle();

      expect(find.text('현재 진행 중인 심사 신청이 있어요'), findsOneWidget);
      expect(find.text('이어서 진행하기'), findsOneWidget);
      expect(find.text('새롭게 진행하기'), findsOneWidget);

      await tester.tap(find.text('새롭게 진행하기'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('새 신청을 시작할까요?'), findsOneWidget);
      expect(
        find.text('이미 심사가 시작된 신청과 발송된 견적은 그대로 유지돼요.'),
        findsOneWidget,
      );

      await tester.tap(find.text('새롭게 진행하기'));
      await tester.pumpAndSettle();

      expect(interceptor.replaceBodies, hasLength(1));
      expect(find.byType(ApplicantTypeSelectionScreen), findsOneWidget);
    });

    testWidgets('replacement API failure keeps current quote screen',
        (tester) async {
      interceptor.failReplacement = true;
      await _pumpQuote(tester);
      await _tapSubmit(tester);
      await tester.tap(find.text('새롭게 진행하기'));
      await tester.pumpAndSettle();

      expect(find.byType(QuoteResultScreen), findsOneWidget);
      expect(find.byType(ApplicantTypeSelectionScreen), findsNothing);
      expect(find.text('잠시 문제가 생겼어요'), findsOneWidget);
      expect(interceptor.replaceBodies, hasLength(1));
    });

    testWidgets('replacement conflict does not reopen start-new loop',
        (tester) async {
      interceptor.createErrorCode = 'APPLICATION_REPLACEMENT_BLOCKED';
      interceptor.replacementErrorCode = 'APPLICATION_REPLACEMENT_BLOCKED';
      await _pumpQuote(tester);
      await _tapSubmit(tester);
      await tester.pumpAndSettle();

      await tester.tap(find.text('새롭게 진행하기'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.text('새롭게 진행하기'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(interceptor.replaceBodies, hasLength(1));
      expect(find.text('새 신청을 시작하지 못했어요'), findsOneWidget);
      expect(find.text('새롭게 진행하기'), findsNothing);
      expect(find.text('이어서 진행하기'), findsOneWidget);
      expect(find.byType(ApplicantTypeSelectionScreen), findsNothing);
    });
  });
}

Future<void> _pumpQuote(WidgetTester tester) async {
  await tester.pumpWidget(
    MaterialApp(
      home: QuoteResultScreen(
        quote: _quote(),
        vehicleName: '캐스퍼',
        vehicleBrand: '현대',
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _tapSubmit(WidgetTester tester) async {
  expect(find.text('이 조건으로 자세한 분석 받기'), findsOneWidget);
  await tester.tap(find.text('서류 제출까지 직접 신청하기'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

QuoteEnvelope _quote() {
  return QuoteEnvelope(
    traceId: 'quote-trace',
    data: QuoteData(
      tier: 'STANDARD',
      vehicleId: 'vehicle-replacement',
      term: 60,
      deposit: 0,
      mileageLimit: 10000,
      monthlyPayment: 315400,
      otdTotal: 14600000,
      vehiclePrice: 14600000,
      residualValue: 5000000,
      residualPct: 0.34,
      promoDiscount: 0,
      estimatedDiscount: 0,
      estimatedTaxes: 0,
      breakdown: const <QuoteBreakdownItem>[],
    ),
  );
}

Response<dynamic> _applicationResponse(
  RequestOptions request, {
  required String applicationId,
}) {
  return Response<dynamic>(
    requestOptions: request,
    statusCode: 200,
    data: <String, dynamic>{
      'data': <String, dynamic>{
        'id': applicationId,
        'user_id': 'user-replacement',
        'vehicle_id': 'vehicle-replacement',
        'status': AppStatus.draft,
      },
      'meta': const <String, dynamic>{'trace_id': 'application-trace'},
    },
  );
}

class _ReplacementFlowInterceptor extends Interceptor {
  final List<Map<String, dynamic>> replaceBodies = <Map<String, dynamic>>[];
  Completer<Response<dynamic>>? pendingReplacement;
  RequestOptions? lastReplacementRequest;
  String createErrorCode = 'APPLICATION_REPLACE_REQUIRED';
  bool failReplacement = false;
  String? replacementErrorCode;
  int createCalls = 0;

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (options.method == 'GET' &&
        options.uri.path == '/api/v1/vehicles/catalog/version') {
      handler.resolve(Response<dynamic>(requestOptions: options, statusCode: 200,
        data: {'contract_version': 'catalog_v1', 'complete': true, 'total': 1,
          'revision': 'a' * 64}));
      return;
    }
    if (options.method == 'GET' &&
        options.uri.path == '/api/v1/vehicles/vehicle-replacement') {
      handler.resolve(
        Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: const <String, dynamic>{
            'id': 'vehicle-replacement',
            'brand': '현대',
            'model_name': '캐스퍼',
            'segment': 'mini',
            'fuel': 'gas',
            'year': 2026,
            'base_price': 14600000,
            'is_published': true,
            'trims': <dynamic>[],
            'options': <dynamic>[],
            'danawa_trims': <dynamic>[],
            'danawa_colors': <dynamic>[],
            'trim_selection': <String, dynamic>{
              'mode': 'UNAVAILABLE',
              'unavailable_message': '세부 등급 정보 준비 중',
            },
          },
        ),
      );
      return;
    }
    if (options.method == 'GET' &&
        options.uri.path == '/api/v1/vehicles/vehicle-replacement/quotes') {
      handler.resolve(
        Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: const <dynamic>[],
        ),
      );
      return;
    }
    if (options.method == 'POST' &&
        options.uri.path == '/api/v1/applications') {
      createCalls += 1;
      handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.badResponse,
          response: Response<dynamic>(
            requestOptions: options,
            statusCode: 409,
            data: <String, dynamic>{
              'error': <String, dynamic>{
                'code': createErrorCode,
                'message': 'application conflict',
              },
            },
          ),
        ),
      );
      return;
    }
    if (options.method == 'POST' &&
        options.uri.path == '/api/v1/applications/replace-active') {
      final body = Map<String, dynamic>.from(options.data as Map);
      replaceBodies.add(body);
      lastReplacementRequest = options;
      final errorCode = replacementErrorCode;
      if (errorCode != null) {
        handler.reject(
          DioException(
            requestOptions: options,
            type: DioExceptionType.badResponse,
            response: Response<dynamic>(
              requestOptions: options,
              statusCode: 409,
              data: <String, dynamic>{
                'error': <String, dynamic>{
                  'code': errorCode,
                  'message': 'application conflict',
                },
              },
            ),
          ),
        );
        return;
      }
      if (failReplacement) {
        handler.reject(
          DioException(
            requestOptions: options,
            type: DioExceptionType.badResponse,
            response: Response<dynamic>(
              requestOptions: options,
              statusCode: 500,
              data: const <String, dynamic>{'detail': 'forced failure'},
            ),
          ),
        );
        return;
      }
      final pending = pendingReplacement;
      if (pending != null && !pending.isCompleted) {
        handler.resolve(await pending.future);
        return;
      }
      handler.resolve(
        _applicationResponse(
          options,
          applicationId: 'replacement-application-1',
        ),
      );
      return;
    }
    handler.next(options);
  }
}
