import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/services/apple_login.dart';
import 'package:recar_app/services/auth_session.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Dio client;
  late AppleLogin login;
  late List<Map<String, dynamic>> starts;
  late List<Map<String, dynamic>> completions;
  late DateTime now;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await AuthSession.instance.clear();
    now = DateTime.utc(2026, 10, 19);
    starts = [];
    completions = [];
    client = Dio(BaseOptions(baseUrl: 'https://api.example.test'));
    client.interceptors.add(InterceptorsWrapper(onRequest: (request, handler) {
      final body = Map<String, dynamic>.from(request.data as Map);
      if (request.path.endsWith('/start')) {
        starts.add(body);
        handler.resolve(Response(requestOptions: request, data: {
          'state': 'synthetic-signed-state',
          'nonce': 'synthetic-nonce',
          'client_id':
              body['platform'] == 'web' ? 'synthetic.web' : 'synthetic.ios',
          'redirect_uri': body['redirect_uri'],
        }));
      } else {
        completions.add(body);
        handler.resolve(Response(requestOptions: request, data: {
          'access_token': 'synthetic-recar-token',
          'user': {
            'id': 'synthetic-user',
            'email': 'synthetic@example.test',
            'role': 'CUSTOMER'
          },
        }));
      }
    }));
    login = AppleLogin(client: client, now: () => now);
  });
  tearDown(() => AuthSession.instance.clear());

  AuthorizationCredentialAppleID credential(
          {String? state = 'synthetic-signed-state',
          String? token = 'synthetic-apple-token'}) =>
      AuthorizationCredentialAppleID(
          authorizationCode: 'synthetic-code',
          identityToken: token,
          state: state,
          userIdentifier: null,
          givenName: null,
          familyName: null,
          email: null);

  for (final path in ['/', '/app/', '/app']) {
    test('web $path uses registered return URL without referral or fragments',
        () async {
      final intent = await login.prepare(
          webUri: Uri.parse('https://recarplan.com$path?ref=RC-TEST#/login'));
      expect(starts.single['platform'], 'web');
      expect(intent.redirectUri.toString(),
          'https://recarplan.com${path == '/' ? '/' : '/app/'}');
      expect(starts.single.toString(), isNot(contains(intent.verifier)));
      final challenge =
          base64UrlEncode(sha256.convert(utf8.encode(intent.verifier)).bytes)
              .replaceAll('=', '');
      expect(starts.single['code_challenge'], challenge);
      expect(intent.nonce, 'synthetic-nonce');
    });
  }

  test('native uses bundle audience with no browser redirect', () async {
    final intent = await login.prepare();
    expect(starts.single['platform'], 'ios');
    expect(starts.single.containsKey('redirect_uri'), isFalse);
    expect(intent.redirectUri, isNull);
  });

  test('successful identity saves normal account session', () async {
    final intent = await login.prepare();
    final user = await login.complete(intent, credential());
    expect(user.id, 'synthetic-user');
    expect(AuthSession.instance.accessToken, 'synthetic-recar-token');
    expect(completions.single['state'], intent.state);
    expect(completions.single['code_verifier'], intent.verifier);
  });

  for (final failure in [
    'state',
    'missing-state',
    'expired',
    'missing-token'
  ]) {
    test('rejects $failure before posting identity or saving session',
        () async {
      final intent = await login.prepare();
      if (failure == 'expired') now = now.add(const Duration(minutes: 5));
      await expectLater(
          login.complete(
              intent,
              credential(
                state: failure == 'state'
                    ? 'wrong'
                    : failure == 'missing-state'
                        ? null
                        : intent.state,
                token:
                    failure == 'missing-token' ? null : 'synthetic-apple-token',
              )),
          throwsA(isA<AppleLoginException>()));
      expect(completions, isEmpty);
      expect(AuthSession.instance.isAuthenticated, isFalse);
    });
  }

  test('provider unavailable does not replace an existing session', () async {
    final intent = await login.prepare();
    await login.complete(intent, credential());
    client.interceptors.clear();
    client.interceptors.add(InterceptorsWrapper(onRequest: (request, handler) {
      handler.reject(DioException(
          requestOptions: request, type: DioExceptionType.connectionError));
    }));
    await expectLater(
        login.complete(intent, credential()), throwsA(isA<DioException>()));
    expect(AuthSession.instance.accessToken, 'synthetic-recar-token');
  });
}
