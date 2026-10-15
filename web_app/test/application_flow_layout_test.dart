import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/models/applicant_subtype.dart';
import 'package:recar_app/models/application.dart';
import 'package:recar_app/screens/applicant_type_selection_screen.dart';
import 'package:recar_app/screens/application_documents_screen.dart';
import 'package:recar_app/screens/application_submission_success_screen.dart';
import 'package:recar_app/screens/document_upload_consent_screen.dart';
import 'package:recar_app/services/api_client.dart';
import 'package:recar_app/theme/app_theme.dart';
import 'package:recar_app/widgets/primary_button.dart';
import 'package:shared_preferences/shared_preferences.dart';

ApplicationEnvelope _application({String status = AppStatus.draft}) =>
    ApplicationEnvelope(
      data: ApplicationResponse(
        id: 'app-flow',
        userId: 'user-1',
        vehicleId: 'vehicle-sorento',
        vehicleName: '쏘렌토',
        vehicleBrand: 'Kia',
        applicantType: ApplicantType.individual,
        status: status,
        monthlyPayment: 612300,
        contractMonths: 60,
        annualKm: 20000,
        deposit: 0,
        vehiclePrice: 45000000,
        trimName: '1.6 터보 하이브리드 시그니처',
        createdAt: DateTime.utc(2026, 10, 7),
        updatedAt: DateTime.utc(2026, 10, 7),
      ),
      traceId: 'flow-layout',
    );

const _snapshot = QuoteSnapshotRequest(
  vehicleName: '쏘렌토',
  vehicleBrand: 'Kia',
  monthlyPayment: 612300,
  termMonths: 60,
  mileageLimit: 20000,
  deposit: 0,
  vehiclePrice: 45000000,
);

class _FlowApi extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.method == 'GET' && options.uri.path.endsWith('/documents')) {
      handler.resolve(Response<dynamic>(
        requestOptions: options,
        statusCode: 200,
        data: const <String, dynamic>{
          'data': <dynamic>[],
          'meta': <String, dynamic>{'trace_id': 'documents'},
        },
      ));
      return;
    }
    handler.reject(DioException(
      requestOptions: options,
      type: DioExceptionType.badResponse,
      response: Response<dynamic>(requestOptions: options, statusCode: 404),
    ));
  }
}

String _plain(Widget widget) => widget is Text
    ? (widget.data ?? widget.textSpan?.toPlainText() ?? '')
        .replaceAll(String.fromCharCode(0x2060), '')
    : '';

PrimaryButton _cta(WidgetTester tester) =>
    tester.widget<PrimaryButton>(find.byType(PrimaryButton).first);

void main() {
  setUpAll(() async {
    await (FontLoader('Pretendard')
          ..addFont(
              rootBundle.load('assets/fonts/pretendard/PretendardVariable.ttf')))
        .load();
  });

  Future<void> pump(
    WidgetTester tester,
    Widget screen, {
    double width = 390,
    double scale = 1,
  }) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final api = _FlowApi();
    ApiClient.dio.interceptors.insert(0, api);
    addTearDown(() => ApiClient.dio.interceptors.remove(api));
    tester.view.physicalSize = Size(width, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          size: Size(width, 844),
          textScaler: TextScaler.linear(scale),
        ),
        child: child!,
      ),
      home: screen,
    ));
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 150));
    }
  }

  Widget typeScreen() => ApplicantTypeSelectionScreen(
        application: _application(),
        vehicleName: '쏘렌토',
        quoteSnapshot: _snapshot,
      );
  Widget consentScreen() => DocumentUploadConsentScreen(
        application: _application(),
        vehicleName: '쏘렌토',
        quoteSnapshot: _snapshot,
        applicantSubtype: ApplicantSubtype.personalEmployed,
      );
  Widget documentsScreen() => ApplicationDocumentsScreen(
        application: _application(),
        vehicleName: '쏘렌토',
        quoteSnapshot: _snapshot,
        applicantSubtype: ApplicantSubtype.personalEmployed,
      );
  Widget successScreen() => ApplicationSubmissionSuccessScreen(
        application: _application(status: AppStatus.submitted),
        quoteSnapshot: _snapshot,
      );

  testWidgets('type step shows "2 / 5" and a subtype enables the CTA',
      (tester) async {
    await pump(tester, typeScreen());
    expect(find.text('2 / 5'), findsOneWidget);
    expect(find.text('신청 유형'), findsOneWidget);
    expect(_cta(tester).onPressed, isNull);
    final employed =
        ApplicantSubtype.labelOf(ApplicantSubtype.personalEmployed);
    await tester.tap(
        find.byWidgetPredicate((widget) => _plain(widget) == employed).first);
    await tester.pump(const Duration(milliseconds: 300));
    expect(_cta(tester).onPressed, isNotNull);
  });

  testWidgets('consent step drops the mismatched "STEP 3/4" and 전체 동의 works',
      (tester) async {
    await pump(tester, consentScreen());
    expect(find.text('3 / 5'), findsOneWidget);
    expect(find.text('동의 확인'), findsOneWidget);
    expect(find.text('STEP 3/4'), findsNothing);
    expect(_cta(tester).onPressed, isNull);
    await tester.tap(find.text('전체 동의'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(_cta(tester).onPressed, isNotNull);
  });

  testWidgets('documents step keeps its copy without "STEP 4/4"',
      (tester) async {
    await pump(tester, documentsScreen());
    expect(find.text('4 / 5'), findsOneWidget);
    expect(find.text('STEP 4/4'), findsNothing);
    expect(find.text('필요한 서류를 제출해 주세요'), findsOneWidget);
    expect(find.byWidgetPredicate((widget) => _plain(widget) == '운전면허증'),
        findsOneWidget);
    expect(find.text('첨부하기'), findsWidgets);
  });

  testWidgets('documents step counts 연락처 once in the required total',
      (tester) async {
    await pump(tester, documentsScreen());
    // 직장인 필수 = 연락처 + 운전면허증 (연락처 슬롯을 두 번 세던 0/3 버그)
    expect(find.text('0/2'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, '01012345678');
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('1/2'), findsOneWidget);
    // 진행 줄과 하단 버튼 안내에 같은 문구가 나온다.
    expect(find.text('서류 1종만 더 첨부하면 신청할 수 있어요'), findsWidgets);
  });

  final screens = <String, Widget Function()>{
    'type': typeScreen,
    'consent': consentScreen,
    'documents': documentsScreen,
    'success': successScreen,
  };
  for (final entry in screens.entries) {
    for (final width in [320.0, 360.0, 390.0, 430.0]) {
      for (final scale in [1.0, 1.3, 2.0]) {
        testWidgets('${entry.key} is overflow-free at $width and text $scale',
            (tester) async {
          await pump(tester, entry.value(), width: width, scale: scale);
          expect(tester.takeException(), isNull);
          if (entry.key == 'documents') {
            final row =
                find.byKey(const ValueKey('document-row-DRIVER_LICENSE'));
            final hint =
                find.byKey(const ValueKey('document-hint-DRIVER_LICENSE'));
            final action =
                find.byKey(const ValueKey('document-action-DRIVER_LICENSE'));
            expect(tester.getSize(hint).width, tester.getSize(row).width);
            expect(tester.getRect(action).bottom,
                lessThanOrEqualTo(tester.getRect(hint).top));
            expect(tester.getSize(action).height, greaterThanOrEqualTo(44));
          }
          final scroll = find.byType(Scrollable);
          if (scroll.evaluate().isNotEmpty) {
            for (var i = 0; i < 8; i++) {
              await tester.drag(scroll.first, const Offset(0, -500),
                  warnIfMissed: false);
              await tester.pump(const Duration(milliseconds: 120));
              expect(tester.takeException(), isNull);
            }
          }
        });
      }
    }
  }
}
