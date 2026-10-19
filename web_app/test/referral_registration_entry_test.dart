import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/models/auth.dart';
import 'package:recar_app/screens/more_screen.dart';
import 'package:recar_app/screens/my_page_screen.dart';
import 'package:recar_app/services/api_client.dart';
import 'package:recar_app/services/auth_session.dart';
import 'package:recar_app/theme/app_theme.dart';
import 'package:recar_app/widgets/primary_button.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Interceptor interceptor;
  late List<Map<String, dynamic>> writes;
  late bool registered;
  late bool hasApplication;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    registered = false;
    hasApplication = false;
    writes = [];
    await AuthSession.instance.setSession(
        accessToken: 'synthetic-referral-session',
        user: const AuthUser(
            id: 'synthetic-customer',
            email: 'synthetic@example.test',
            fullName: 'Synthetic',
          phoneNumber: null,
            role: 'CUSTOMER',
            isActive: true));
    interceptor = InterceptorsWrapper(onRequest: (options, handler) {
      if (options.path == '/api/v1/referrals/apply-code') {
        writes.add(Map<String, dynamic>.from(options.data as Map));
        registered = true;
      }
      if (options.path.startsWith('/api/v1/referrals/')) {
        handler.resolve(Response(requestOptions: options, data: {
          'registered': registered,
          'can_apply': !registered && !hasApplication,
          'blocked_reason': registered
              ? 'ALREADY_REGISTERED'
              : hasApplication
                  ? 'APPLICATION_ALREADY_CREATED'
                  : null,
          'referral_code': registered ? 'RC-SYNTHETIC' : null,
          'coupon_amount': registered ? 50000 : 0,
        }));
      } else {
        handler.resolve(Response(requestOptions: options, data: {'data': []}));
      }
    });
    ApiClient.dio.interceptors.insert(0, interceptor);
  });
  tearDown(() async {
    ApiClient.dio.interceptors.remove(interceptor);
    await AuthSession.instance.clear();
  });

  Future<void> show(WidgetTester tester, Widget page) async {
    await tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: page));
    await tester.pumpAndSettle();
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  for (final width in [320.0, 390.0]) {
    testWidgets('current My tab opens real referral state at $width',
        (tester) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await show(tester, const MoreScreen());
      await tester.ensureVisible(find.text('추천인 등록'));
      await tester.tap(find.text('추천인 등록'));
      await tester.pumpAndSettle();
      expect(find.byType(ReferralRegistrationPage), findsOneWidget);
      expect(find.widgetWithText(TextField, '추천인 코드 (선택)'), findsOneWidget);
      expect(writes, isEmpty);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
      'register sends normalized code through existing authenticated API',
      (tester) async {
    await show(tester, const ReferralRegistrationPage());
    await tester.enterText(find.byType(TextField), 'rc-synthetic');
    await tester.tap(find.byType(PrimaryButton));
    await tester.pumpAndSettle();
    expect(writes.single, {'code': 'RC-SYNTHETIC', 'source': 'MYPAGE'});
    expect(find.text('RC-SYNTHETIC'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });

  for (final reason in ['registered', 'application']) {
    testWidgets('$reason blocks changes instead of overwriting attribution',
        (tester) async {
      registered = reason == 'registered';
      hasApplication = reason == 'application';
      await show(tester, const ReferralRegistrationPage());
      expect(find.byType(TextField), findsNothing);
      expect(writes, isEmpty);
      expect(
          find.text(registered
              ? '추천인은 이미 등록되어 변경할 수 없어요.'
              : '조건 확인 요청을 생성한 뒤에는 추천인을 등록할 수 없어요.'),
          findsOneWidget);
    });
  }
}
