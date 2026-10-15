import 'package:dio/dio.dart';
import 'package:file_selector_platform_interface/file_selector_platform_interface.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:recar_app/models/application.dart';
import 'package:recar_app/models/auth.dart';
import 'package:recar_app/screens/application_documents_screen.dart';
import 'package:recar_app/services/api_client.dart';
import 'package:recar_app/services/application_api.dart';
import 'package:recar_app/services/auth_session.dart';
import 'package:shared_preferences/shared_preferences.dart';

final _pdf =
    Uint8List.fromList('%PDF-1.4\nsynthetic upload test\n%%EOF'.codeUnits);
Map<String, dynamic> _document() => {
      'id': 'test-document',
      'application_id': 'test-application',
      'document_type': 'DRIVER_LICENSE',
      'file_name': 'document.pdf',
      'status': 'UPLOADED',
      'review_status': 'PENDING',
      'created_at': '2026-10-15T00:00:00Z',
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _UploadRequests requests;
  late FileSelectorPlatform originalPicker;
  late _Picker picker;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await AuthSession.instance.setSession(
      accessToken: 'synthetic-test-token',
      user: const AuthUser(
        id: 'test-user',
        email: 'test@example.invalid',
        fullName: '테스트',
        phoneNumber: '01000000000',
        role: 'CUSTOMER',
        isActive: true,
      ),
    );
    requests = _UploadRequests();
    ApiClient.dio.interceptors.add(requests);
    originalPicker = FileSelectorPlatform.instance;
    picker = _Picker();
    FileSelectorPlatform.instance = picker;
  });

  tearDown(() async {
    FileSelectorPlatform.instance = originalPicker;
    ApiClient.dio.interceptors.remove(requests);
    await AuthSession.instance.clear();
  });

  test('presigned upload sends bytes, not a browser file path or app token',
      () async {
    await http.runWithClient(() async {
      await ApplicationApi.putFileToS3(
        uploadUrl: 'https://storage.example.invalid/synthetic',
        filePath: 'not-a-filesystem-path.pdf',
        fileBytes: _pdf,
        contentType: 'application/pdf',
      );
    },
        () => MockClient((request) async {
              expect(request.method, 'PUT');
              expect(request.bodyBytes, _pdf);
              expect(request.headers['content-type'], 'application/pdf');
              expect(
                  request.headers.keys
                      .any((key) => key.toLowerCase() == 'authorization'),
                  isFalse);
              return http.Response('', 200);
            }));
  });

  test('storage failure is not reported as an uploaded document', () async {
    await http.runWithClient(() async {
      await expectLater(
          ApplicationApi.putFileToS3(
            uploadUrl: 'https://storage.example.invalid/synthetic',
            filePath: 'not-a-filesystem-path.pdf',
            fileBytes: _pdf,
            contentType: 'application/pdf',
          ),
          throwsA(isA<DocumentUploadException>()));
    }, () => MockClient((_) async => http.Response('', 500)));
  });

  test('server upload keeps bearer auth and exact file bytes', () async {
    final uploaded = await ApplicationApi.uploadDocumentViaServer(
      applicationId: 'test-application',
      docType: 'DRIVER_LICENSE',
      filePath: 'not-a-filesystem-path.pdf',
      fileBytes: _pdf,
      filename: 'document.pdf',
      contentType: 'application/pdf',
    );
    expect(uploaded.data.id, 'test-document');
    expect(requests.uploads, 1);
    expect(requests.filename, 'document.pdf');
    expect(requests.bytes, _pdf);
    expect(requests.authorization, 'Bearer synthetic-test-token');
  });

  testWidgets('browser PDF selection uploads through the existing document API',
      (tester) async {
    picker.file =
        XFile.fromData(_pdf, name: '홍길동_민감정보.pdf', mimeType: 'application/pdf');
    await _open(tester);
    await _choose(tester);
    expect(picker.calls, 1);
    expect(requests.uploads, 1);
    expect(requests.filename, 'document.pdf');
    expect(requests.bytes, _pdf);
    expect(find.text('운전면허증 첨부 완료'), findsOneWidget);
    expect(requests.deletes, 0);
    expect(tester.takeException(), isNull);
  }, skip: !kIsWeb);

  for (final sample in [
    (name: 'empty.pdf', bytes: Uint8List(0), message: '비어 있는 파일은 첨부할 수 없어요.'),
    (
      name: 'large.pdf',
      bytes: Uint8List(20 * 1024 * 1024 + 1),
      message: '20MB 이하 파일만 첨부할 수 있어요.'
    ),
    (
      name: 'test.exe',
      bytes: _pdf,
      message: 'JPG, PNG, HEIC, PDF 파일만 첨부할 수 있어요.'
    ),
  ]) {
    testWidgets('browser rejects ${sample.name} without sending a file',
        (tester) async {
      picker.file = XFile.fromData(sample.bytes, name: sample.name);
      await _open(tester);
      await _choose(tester);
      expect(find.text(sample.message), findsOneWidget);
      expect(requests.uploads, 0);
      expect(requests.prepares, 0);
      expect(requests.deletes, 0);
    }, skip: !kIsWeb);
  }

  testWidgets('cancel does not upload or delete documents', (tester) async {
    picker.file = null;
    await _open(tester);
    await _choose(tester);
    expect(picker.calls, 1);
    expect(requests.uploads, 0);
    expect(requests.deletes, 0);
    expect(find.text('운전면허증 첨부 완료'), findsNothing);
  }, skip: !kIsWeb);

  testWidgets('cancelling replacement keeps the previous uploaded document', (tester) async {
    requests.existing = true;
    picker.file = null;
    await _open(tester);
    final action = find.byKey(const ValueKey('document-action-DRIVER_LICENSE'));
    await tester.ensureVisible(action);
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.text('파일 선택해서 교체'), findsOneWidget);
    await tester.tap(find.text('파일 선택해서 교체'));
    await tester.pumpAndSettle();
    expect(picker.calls, 1);
    expect(requests.uploads, 0);
    expect(requests.deletes, 0);
    expect(find.text('파일 변경'), findsOneWidget);
  }, skip: !kIsWeb);

  testWidgets('a pending upload is not counted as a completed document', (tester) async {
    requests.documentList = [{..._document(), 'status': 'PENDING_UPLOAD'}];
    await _open(tester);
    expect(find.text('파일 변경'), findsNothing);
    expect(find.text('서류 준비 완료'), findsNothing);
    expect(find.byKey(const ValueKey('document-action-DRIVER_LICENSE')), findsOneWidget);
  }, skip: !kIsWeb);

  testWidgets('a failed pending replacement cannot hide the uploaded document', (tester) async {
    requests.documentList = [_document(), {..._document(), 'id': 'pending', 'status': 'PENDING_UPLOAD', 'file_name': 'pending.pdf'}];
    await _open(tester);
    expect(find.text('파일 변경'), findsOneWidget);
    expect(find.text('pending.pdf'), findsNothing);
  }, skip: !kIsWeb);

  testWidgets('failed upload can retry without a false success', (tester) async {
    requests.uploadStatus = 500;
    picker.file = XFile.fromData(_pdf, name: 'retry.pdf');
    await _open(tester);
    await _choose(tester);
    expect(requests.uploads, 1);
    expect(find.text('운전면허증 첨부 완료'), findsNothing);
    requests.uploadStatus = 200;
    await _choose(tester);
    expect(requests.uploads, 2);
    expect(find.text('운전면허증 첨부 완료'), findsOneWidget);
    expect(requests.deletes, 0);
    await tester.runAsync(() => Future<void>.delayed(const Duration(seconds: 3)));
    await tester.pumpAndSettle();
  }, skip: !kIsWeb);

  testWidgets('401 does not bypass authorization with server fallback',
      (tester) async {
    requests.prepareStatus = 401;
    picker.file = XFile.fromData(_pdf, name: 'test.pdf');
    await _open(tester);
    await _choose(tester);
    expect(requests.prepares, 1);
    expect(requests.uploads, 0);
    expect(find.text('운전면허증 첨부 완료'), findsNothing);
    expect(find.text('로그인 상태를 확인한 뒤 다시 첨부해 주세요.'), findsOneWidget);
  }, skip: !kIsWeb);
}

Future<void> _open(WidgetTester tester) async {
  tester.view.physicalSize = const Size(430, 1000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
      home: ApplicationDocumentsScreen(
    application: ApplicationEnvelope(
        data: ApplicationResponse(
          id: 'test-application',
          userId: 'test-user',
          vehicleId: 'test-vehicle',
          vehicleName: '테스트 차량',
          vehicleBrand: '테스트',
          applicantType: ApplicantType.individual,
          status: AppStatus.draft,
          createdAt: DateTime.utc(2026, 10, 15),
          updatedAt: DateTime.utc(2026, 10, 15),
        ),
        traceId: 'synthetic-test'),
    vehicleName: '테스트 차량',
  )));
  await tester.pumpAndSettle();
}

Future<void> _choose(WidgetTester tester) async {
  final action = find.byKey(const ValueKey('document-action-DRIVER_LICENSE'));
  await tester.ensureVisible(action);
  await tester.runAsync(() async {
    await tester.tap(action);
    // Browser FileReader completes outside the widget test's fake clock.
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });
  await tester.pumpAndSettle();
}

class _Picker extends FileSelectorPlatform {
  XFile? file;
  int calls = 0;
  @override
  Future<XFile?> openFile(
      {List<XTypeGroup>? acceptedTypeGroups,
      String? initialDirectory,
      String? confirmButtonText}) async {
    calls++;
    expect(acceptedTypeGroups!.single.extensions,
        containsAll(['jpg', 'png', 'pdf']));
    return file;
  }
}

class _UploadRequests extends Interceptor {
  int uploads = 0, prepares = 0, deletes = 0;
  int prepareStatus = 503;
  int uploadStatus = 200;
  bool existing = false;
  List<Map<String, dynamic>>? documentList;
  String? filename, authorization;
  List<int>? bytes;
  @override
  Future<void> onRequest(
      RequestOptions options, RequestInterceptorHandler handler) async {
    final path = options.uri.path;
    if (options.method == 'DELETE') deletes++;
    if (path.endsWith('/upload-url')) {
      prepares++;
      handler.reject(DioException(
          requestOptions: options,
          type: DioExceptionType.badResponse,
          response: Response(
              requestOptions: options,
              statusCode: prepareStatus,
              data: {'detail': 'synthetic test'})));
      return;
    }
    if (path.endsWith('/upload')) {
      uploads++;
      authorization = options.headers['Authorization'] as String?;
      final form = options.data as FormData;
      final file = form.files.single.value;
      filename = file.filename;
      bytes = await file.finalize().expand((chunk) => chunk).toList();
      if (uploadStatus != 200) {
        handler.reject(DioException(requestOptions: options, type: DioExceptionType.badResponse,
          response: Response(requestOptions: options, statusCode: uploadStatus, data: {'detail': '업로드 테스트 실패'})));
        return;
      }
      handler.resolve(Response(requestOptions: options, statusCode: 200, data: {
        'data': _document(),
        'meta': {'trace_id': 'synthetic-test'}
      }));
      return;
    }
    if (path.endsWith('/documents')) {
      handler.resolve(Response(requestOptions: options, statusCode: 200, data: {
            'data': documentList ?? (existing ? [_document()] : []),
        'meta': {'trace_id': 'synthetic-test'}
      }));
      return;
    }
    if (path.endsWith('/events')) {
      handler.resolve(Response(requestOptions: options, statusCode: 200, data: {
        'data': {
          'id': 'test-application',
          'user_id': 'test-user',
          'vehicle_id': 'test-vehicle',
          'status': AppStatus.docsPending,
        },
        'meta': {'trace_id': 'synthetic-test'}
      }));
      return;
    }
    handler.reject(DioException(
        requestOptions: options,
        error: 'Unexpected synthetic-test request: $path'));
  }
}
