import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/widgets/micro_interactions.dart';

void main() {
  Widget screen(int? amount, {bool loading = false, bool reduced = false}) {
    return MaterialApp(
        home: MediaQuery(
      data: MediaQueryData(disableAnimations: reduced),
      child: Scaffold(
          body: Center(
              child: RollingMoneyText(
        amount: amount,
        loading: loading,
        style: const TextStyle(fontSize: 42),
      ))),
    ));
  }

  testWidgets('digits move and settle on the verified value', (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(screen(281800));
      expect(find.bySemanticsLabel('281,800'), findsOneWidget);
      await tester.pumpWidget(screen(290100));
      final digit = find
          .descendant(
              of: find
                  .descendant(
                      of: find.byType(RollingMoneyText),
                      matching: find.byType(ClipRect))
                  .at(1),
              matching: find.byType(Text))
          .first;
      final start = tester.getTopLeft(digit).dy;
      await tester.pump(const Duration(milliseconds: 140));
      expect(tester.getTopLeft(digit).dy, isNot(start));
      expect(find.bySemanticsLabel('290,100'), findsOneWidget);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('loading hides the previous amount without losing the reel state',
      (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(screen(281800));
      final state = tester.state(find.byType(RollingMoneyText));
      await tester.pumpWidget(screen(null, loading: true));
      expect(find.bySemanticsLabel('281,800'), findsNothing);
      await tester.pumpWidget(screen(290100));
      expect(tester.state(find.byType(RollingMoneyText)), same(state));
      expect(find.bySemanticsLabel('290,100'), findsOneWidget);
      await tester.pumpAndSettle();
    } finally {
      semantics.dispose();
    }
  });

  testWidgets(
      'rapid updates and a digit-count change settle on the latest amount',
      (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(screen(999900));
      await tester.pumpWidget(screen(1000100));
      await tester.pump(const Duration(milliseconds: 80));
      await tester.pumpWidget(screen(308400));
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('308,400'), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('the same quote settles correctly after an interrupted reel',
      (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(screen(281800));
      await tester.pumpWidget(screen(290100));
      await tester.pump(const Duration(milliseconds: 140));
      await tester.pumpWidget(screen(290100, loading: true));
      expect(find.bySemanticsLabel('290,100'), findsNothing);
      await tester.pumpWidget(screen(290100));
      await tester.pumpAndSettle();
      final reel = find
          .descendant(
              of: find.byType(RollingMoneyText),
              matching: find.byType(ClipRect))
          .at(1);
      final nine = find.descendant(of: reel, matching: find.text('9'));
      expect(tester.getTopLeft(nine).dy, tester.getTopLeft(reel).dy);
      expect(find.bySemanticsLabel('290,100'), findsOneWidget);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('reduced motion exposes the final amount immediately',
      (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(screen(281800, reduced: true));
      await tester.pumpWidget(screen(290100, reduced: true));
      expect(find.bySemanticsLabel('290,100'), findsOneWidget);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });
}
