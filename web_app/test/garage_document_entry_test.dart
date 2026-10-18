import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/models/auth.dart';
import 'package:recar_app/screens/application_documents_screen.dart';
import 'package:recar_app/screens/garage_screen.dart';
import 'package:recar_app/services/api_client.dart';
import 'package:recar_app/services/auth_session.dart';
import 'package:recar_app/theme/app_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _DocumentEntryApi api;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await AuthSession.instance.clear();
    await AuthSession.instance.setSession(
      accessToken: 'synthetic-document-entry-session',
      user: const AuthUser(
        id: 'document-entry-user',
        email: 'document-entry@example.com',
        fullName: 'Synthetic Document Entry',
        phoneNumber: null,
        role: 'CUSTOMER',
        isActive: true,
      ),
    );
    api = _DocumentEntryApi();
    ApiClient.dio.interceptors.insert(0, api);
  });

  tearDown(() async {
    ApiClient.dio.interceptors.remove(api);
    await AuthSession.instance.clear();
  });

  for (final status in [
    'DRAFT',
    'DOCS_PENDING',
    'SUBMITTED',
    'UNDER_REVIEW',
    'NEED_MORE_INFO',
    'APPROVED',
    'CONTRACTING',
    'DELIVERING',
  ]) {
    testWidgets('$status has a reachable document entry', (tester) async {
      api.status = status;
      await _openReport(tester);
      expect(find.text('서류 확인·추가'), findsOneWidget);
      expect(tester.takeException(), isNull);
      expect(api.applicationWrites, 0);
    });
  }

  for (final status in [
    'CANCELLED',
    'REJECTED',
    'DONE',
    'DELIVERY_COMPLETED',
  ]) {
    testWidgets('$status does not offer an unrestricted new upload', (
      tester,
    ) async {
      api.status = status;
      await _openReport(tester);
      expect(find.text('서류 확인·추가'), findsNothing);
      expect(api.applicationWrites, 0);
    });
  }

  for (final width in [320.0, 390.0]) {
    testWidgets(
      'existing application documents open without replacing it at $width',
      (tester) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await _openReport(tester);
        await tester.tap(find.text('서류 확인·추가'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));
        await tester.pump(const Duration(milliseconds: 200));
        final screen = tester.widget<ApplicationDocumentsScreen>(
          find.byType(ApplicationDocumentsScreen),
        );
        expect(screen.application.data.id, 'document-entry-application');
        expect(screen.additionalSubmissionMode, isTrue);
        expect(api.applicationWrites, 0);
        expect(tester.takeException(), isNull);
      },
    );
  }
}

Future<void> _openReport(WidgetTester tester) async {
  addTearDown(() async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
  await tester.pumpWidget(
    MaterialApp(theme: AppTheme.light(), home: const GarageScreen()),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pump(const Duration(milliseconds: 100));
  final vehicle = find.byWidgetPredicate((widget) {
    if (widget is! Text) return false;
    final text = widget.data ?? widget.textSpan?.toPlainText() ?? '';
    return text.replaceAll('\u2060', '').contains('TEST-MORNING');
  });
  expect(vehicle, findsWidgets);
  await tester.tap(vehicle.first);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
  await tester.pump(const Duration(milliseconds: 100));
}

class _DocumentEntryApi extends Interceptor {
  String status = 'SUBMITTED';
  int applicationWrites = 0;

  Map<String, dynamic> get application => {
    'id': 'document-entry-application',
    'user_id': 'document-entry-user',
    'vehicle_id': 'document-entry-vehicle',
    'vehicle_name': 'TEST-MORNING',
    'vehicle_brand': '테스트',
    'applicant_type': 'INDIVIDUAL',
    'individual_subtype': 'SALARIED',
    'status': status,
    'created_at': '2026-10-19T00:00:00Z',
    'updated_at': '2026-10-19T00:00:00Z',
  };

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final path = options.uri.path;
    if (options.method != 'GET' && path.contains('/applications')) {
      applicationWrites++;
    }
    Object? data;
    var statusCode = 200;
    if (path == '/api/v1/applications/me') {
      data = {
        'data': [application],
        'meta': {'trace_id': 'synthetic'},
      };
    } else if (path == '/api/v1/applications/document-entry-application') {
      data = {
        'data': application,
        'meta': {'trace_id': 'synthetic'},
      };
    } else if (path.endsWith('/documents') ||
        path.endsWith('/quote-documents')) {
      data = {
        'data': [],
        'meta': {'trace_id': 'synthetic'},
      };
    } else {
      statusCode = 404;
      data = {
        'error': {'code': 'TEST_NOT_FOUND', 'message': 'Test-only route'},
      };
    }
    handler.resolve(
      Response(requestOptions: options, statusCode: statusCode, data: data),
    );
  }
}
