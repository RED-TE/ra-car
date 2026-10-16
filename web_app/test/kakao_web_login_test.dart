import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/services/auth_session.dart';
import 'package:recar_app/services/kakao_web_browser.dart';
import 'package:recar_app/services/kakao_web_login.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Browser implements KakaoWebBrowser {
  @override
  Uri uri = Uri.parse('https://recarplan.com/app/?ref=RC-TEST');
  String? pending;
  Uri? target;
  @override
  String? readPending() => pending;
  @override
  void writePending(String value) => pending = value;
  @override
  void clearPending() => pending = null;
  @override
  void replaceUrl(Uri value) => uri = value;
  @override
  void navigate(Uri value) => target = value;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Browser browser;
  late Dio client;
  late KakaoWebLogin login;
  late List<Map<String, dynamic>> completions;
  final now = DateTime.utc(2026, 10, 16);
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await AuthSession.instance.clear();
    browser = _Browser();
    completions = [];
    client = Dio(BaseOptions(baseUrl: 'https://api.test'));
    client.interceptors.add(InterceptorsWrapper(onRequest: (request, handler) {
      final body = Map<String, dynamic>.from(request.data as Map);
      if (request.path.endsWith('/start')) {
        final url = Uri.https('kauth.kakao.com', '/oauth/authorize', {
          'state': 'test-signed-state',
          'redirect_uri': body['redirect_uri'],
          'code_challenge': body['code_challenge'],
          'code_challenge_method': 'S256',
        });
        handler.resolve(Response(requestOptions: request, data: {
          'authorization_url': url.toString(),
          'state': 'test-signed-state',
        }));
      } else {
        completions.add(body);
        handler.resolve(Response(requestOptions: request, data: {
          'access_token': 'test-recar-session',
          'token_type': 'bearer',
          'is_new_user': false,
          'user': {
            'id': 'test-user',
            'email': 'synthetic@example.test',
            'role': 'CUSTOMER'
          },
        }));
      }
    }));
    login = KakaoWebLogin(browser: browser, client: client, now: () => now);
  });
  tearDown(() async => AuthSession.instance.clear());

  test('start stores per-tab proof and sends only its challenge', () async {
    await login.start();
    final record = jsonDecode(browser.pending!) as Map;
    final challenge =
        base64UrlEncode(sha256.convert(utf8.encode(record['verifier'])).bytes)
            .replaceAll('=', '');
    expect(browser.target!.queryParameters['code_challenge'], challenge);
    expect(browser.target!.queryParameters['redirect_uri'],
        'https://recarplan.com/app/');
    expect(browser.target.toString(), isNot(contains(record['verifier'])));
    expect(browser.target!.queryParameters['state'], record['state']);
  });

  test('root entry uses the exact registered root redirect', () async {
    browser.uri = Uri.parse('https://recarplan.com/?ref=RC-TEST#/login');
    await login.start();
    expect(browser.target!.queryParameters['redirect_uri'],
        'https://recarplan.com/');
  });

  test('callback cleans URL, consumes proof and establishes the normal session',
      () async {
    await login.start();
    browser.uri = Uri.parse(
        'https://recarplan.com/app/?ref=RC-TEST&code=test-code&state=test-signed-state');
    final result = await login.complete();
    expect(result.isNewUser, isFalse);
    expect(AuthSession.instance.isAuthenticated, isTrue);
    expect(browser.pending, isNull);
    expect(browser.uri.queryParameters, {'ref': 'RC-TEST'});
    expect(browser.uri.fragment, '/login');
    expect(completions.single['code'], 'test-code');
    await expectLater(login.complete(), throwsA(isA<KakaoWebLoginException>()));
    expect(completions, hasLength(1));
  });

  for (final failure in ['missing', 'wrong-state', 'expired', 'cancelled']) {
    test('rejects $failure callback without token exchange', () async {
      await login.start();
      browser.uri = Uri.parse(
          'https://recarplan.com/app/?code=test-code&state=test-signed-state');
      if (failure == 'missing') browser.pending = null;
      if (failure == 'wrong-state') {
        browser.uri = Uri.parse(
            'https://recarplan.com/app/?code=test-code&state=attacker-state');
      }
      if (failure == 'expired') {
        final record = jsonDecode(browser.pending!) as Map<String, dynamic>;
        record['expires_at'] = now.millisecondsSinceEpoch;
        browser.pending = jsonEncode(record);
      }
      if (failure == 'cancelled') {
        browser.uri = Uri.parse(
            'https://recarplan.com/app/?error=access_denied&state=test-signed-state');
      }
      await expectLater(
          login.complete(), throwsA(isA<KakaoWebLoginException>()));
      expect(completions, isEmpty);
      expect(AuthSession.instance.isAuthenticated, isFalse);
      expect(browser.pending, isNull);
      expect(browser.uri.queryParameters, isEmpty);
    });
  }
}
