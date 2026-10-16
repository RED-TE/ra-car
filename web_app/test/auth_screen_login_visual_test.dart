import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/screens/auth_screen.dart';

void main() {
  for (final width in [320.0, 390.0, 430.0]) {
    testWidgets('login has no decorative images at ${width}px', (tester) async {
      await tester.binding.setSurfaceSize(Size(width, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(const MaterialApp(home: AuthScreen()));

      expect(find.byType(Image), findsNothing);
      expect(find.bySemanticsLabel('리카 자동차 캐릭터'), findsNothing);
      expect(find.text('카카오로 계속하기'), findsOneWidget);
      expect(find.byTooltip('나가기'), findsOneWidget);
      expect(find.text('이메일 또는 아이디'), findsOneWidget);
      expect(find.text('비밀번호'), findsOneWidget);

      final emailLogin = find.widgetWithText(FilledButton, '이메일로 로그인');
      expect(tester.widget<FilledButton>(emailLogin).onPressed, isNull);
      await tester.enterText(find.byType(TextField).at(0), 'layout-test');
      await tester.enterText(find.byType(TextField).at(1), 'not-a-real-password');
      await tester.pump();
      expect(tester.widget<FilledButton>(emailLogin).onPressed, isNotNull);
      expect(tester.takeException(), isNull);
    });
  }
}
