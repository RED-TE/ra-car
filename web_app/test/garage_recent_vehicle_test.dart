// SYNTHETIC applications only. API requests are intercepted, storage is mocked.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/models/application.dart';
import 'package:recar_app/models/auth.dart';
import 'package:recar_app/models/vehicle.dart';
import 'package:recar_app/screens/garage_screen.dart';
import 'package:recar_app/services/api_client.dart';
import 'package:recar_app/services/auth_session.dart';
import 'package:recar_app/services/recent_viewed_service.dart';
import 'package:recar_app/theme/app_theme.dart';
import 'package:recar_app/widgets/garage_recent_vehicle_hero.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _captureDir = String.fromEnvironment('GARAGE_CAPTURE_DIR');
const _morning = '더 뉴 모닝(JA PE)';
const _sorento = '더 뉴 쏘렌토 HEV(MQ4 F/L)';

VehicleListItem _vehicle(String id, String name, {String? thumbnail}) =>
    VehicleListItem(
      id: id,
      brand: '기아',
      modelName: name,
      segment: 'SYNTHETIC',
      fuel: 'gasoline',
      year: 2026,
      priceFrom: 0,
      monthlyPayment: 987654,
      thumbnailUrl: thumbnail,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final recent = RecentViewedService.instance;
  late _GarageInterceptor interceptor;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'recent_viewed_v2': jsonEncode([
        RecentViewedEntry(
          item: _vehicle('last-public', _morning),
          viewedAt: DateTime.utc(2026, 10, 20),
        ).toJson(),
        RecentViewedEntry(
          item: _vehicle('older-public', _sorento),
          viewedAt: DateTime.utc(2026, 10, 19),
        ).toJson(),
      ]),
    });
    await AuthSession.instance.clear();
    interceptor = _GarageInterceptor();
    ApiClient.dio.interceptors.add(interceptor);
  });

  tearDown(() async {
    ApiClient.dio.interceptors.remove(interceptor);
    await AuthSession.instance.clear();
  });

  Future<void> seed() async {
    await recent.loadFromStorage();
    for (final entry in recent.items.toList()) {
      recent.removeByVehicleId(entry.item.id);
    }
    recent.record(_vehicle('older-public', _sorento));
    recent.record(_vehicle('last-public', _morning));
  }

  testWidgets(
    'uses the exact homepage blue garage image and preserves the old asset',
    (tester) async {
      final photo = (await tester.runAsync(
        () => rootBundle.load('assets/images/garage/garage_home_bg.png'),
      ))!;
      expect(
        sha256.convert(photo.buffer.asUint8List()).toString(),
        '03efda0dc086e522ba96a04379172defef1807fe4435c797b0bf4f5fb1657247',
      );
      final legacy = (await tester.runAsync(
        () => rootBundle.load('assets/images/garage/garage_hero_bg.png'),
      ))!;
      expect(
        sha256.convert(legacy.buffer.asUint8List()).toString(),
        // This pinned web baseline already uses the same homepage blue
        // artwork under the old filename. Preserve that asset unchanged.
        '03efda0dc086e522ba96a04379172defef1807fe4435c797b0bf4f5fb1657247',
      );
    },
    // Raw asset SHA is verified by VM and release staging. The browser widget
    // harness cannot read raw bundle bytes; browser UI assertions still run.
    skip: kIsWeb,
  );

  testWidgets('homepage photo fills the screen width without recoloring', (
    tester,
  ) async {
    await seed();
    await _pump(tester, const GarageScreen());
    final photo = tester.widget<Image>(
      find.byKey(const Key('garage-home-photo-background')),
    );
    expect(
      (photo.image as AssetImage).assetName,
      'assets/images/garage/garage_home_bg.png',
    );
    expect(photo.color, isNull);
    expect(photo.fit, BoxFit.cover);
    expect(photo.alignment, const Alignment(0, 0.3));
    expect(
      tester.getSize(find.byKey(const Key('garage-home-photo-stage'))),
      const Size(390, 252),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'guest uses latest persisted public image without application data',
    (tester) async {
      await _pump(
        tester,
        const GarageScreen(initialApplication: _privateApplication),
      );
      final name = tester.widget<Text>(
        find.byKey(const Key('garage-recent-vehicle-name')),
      );
      expect(name.data, _morning);
      expect(find.text(_sorento), findsNothing);
      expect(find.text('SYNTHETIC PRIVATE APPLICATION'), findsNothing);
      expect(find.textContaining('987,654'), findsNothing);
      expect(interceptor.requests, isEmpty);
      expect(_vehicleAsset(tester), 'assets/danawa/kia_모닝_360.png');
      await _capture(tester, 'guest-recent-390.png');
    },
  );

  testWidgets(
    'same mounted garage updates when the last viewed vehicle changes',
    (tester) async {
      await seed();
      await _pump(tester, const GarageScreen());
      recent.record(_vehicle('next-public', _sorento));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(
        tester
            .widget<Text>(find.byKey(const Key('garage-recent-vehicle-name')))
            .data,
        _sorento,
      );
      expect(_vehicleAsset(tester), 'assets/danawa/kia_쏘렌토_360.png');
      expect(interceptor.requests, isEmpty);
    },
  );

  testWidgets(
    'reports and status tabs are below the photo and keep their amounts',
    (tester) async {
      await seed();
      await _login();
      await _pump(tester, const GarageScreen());
      final hero = find.byKey(const Key('garage-recent-vehicle-hero'));
      final tab = find.text('견적 리포트');
      expect(
        tester.getBottomLeft(hero).dy,
        lessThan(tester.getTopLeft(tab).dy),
      );
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('garage-report-payment-row')),
        150,
        scrollable: find
            .descendant(
              of: find.byKey(const ValueKey('garage-report-scroll')),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(find.text('받아본 견적'), findsOneWidget);
      expect(find.textContaining('321,000'), findsWidgets);
      expect(
        interceptor.requests.where((p) => p == '/api/v1/applications/me'),
        hasLength(1),
      );
      expect(interceptor.requests.any((p) => p.contains('/quotes/')), isFalse);
      await _capture(tester, 'authenticated-recent-390.png');
    },
  );

  testWidgets(
    'authenticated garage without applications still shows browsing history',
    (tester) async {
      await seed();
      await _login();
      interceptor.empty = true;
      await _pump(tester, const GarageScreen());
      expect(
        find.byKey(const Key('garage-recent-vehicle-hero')),
        findsOneWidget,
      );
      expect(find.text(_morning), findsOneWidget);
      expect(find.text('아직 저장된 견적이 없어요'), findsOneWidget);
    },
  );

  testWidgets(
    'history opens only the latest ID and never restores saved quote conditions',
    (tester) async {
      await seed();
      String? opened;
      await _pump(
        tester,
        GarageRecentVehicleHero(
          onOpenVehicle: (id) => opened = id,
          onBrowseVehicles: () => fail('Must open latest vehicle'),
        ),
      );
      await tester.tap(find.byKey(const Key('garage-recent-vehicle-open')));
      expect(opened, 'last-public');
      expect(interceptor.requests, isEmpty);
    },
  );

  testWidgets('empty history has a neutral placeholder and browse action', (
    tester,
  ) async {
    await seed();
    for (final entry in recent.items.toList()) {
      recent.removeByVehicleId(entry.item.id);
    }
    var browsed = false;
    await _pump(
      tester,
      GarageRecentVehicleHero(
        onOpenVehicle: (_) => fail('No vehicle to open'),
        onBrowseVehicles: () => browsed = true,
      ),
    );
    expect(
      find.byKey(const Key('garage-recent-vehicle-placeholder')),
      findsOneWidget,
    );
    expect(find.text('마지막으로 본 차량이 여기에 표시돼요'), findsOneWidget);
    await tester.tap(find.byKey(const Key('garage-recent-vehicle-open')));
    expect(browsed, isTrue);
  });

  testWidgets('missing image never substitutes a different car', (
    tester,
  ) async {
    await seed();
    recent.record(
      _vehicle(
        'unknown-public',
        'SYNTHETIC UNKNOWN MODEL',
        thumbnail: 'assets/cars/Kia/nonexistent-synthetic.png',
      ),
    );
    await _pump(
      tester,
      GarageRecentVehicleHero(onOpenVehicle: (_) {}, onBrowseVehicles: () {}),
    );
    expect(find.text('SYNTHETIC UNKNOWN MODEL'), findsOneWidget);
    await _waitForImageFallback(tester);
    expect(
      find.byKey(const Key('garage-recent-vehicle-placeholder')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'unavailable remote image keeps the right name and a neutral fallback',
    (tester) async {
      await seed();
      recent.record(
        _vehicle(
          'remote-public',
          'SYNTHETIC REMOTE MODEL',
          thumbnail: 'http://127.0.0.1:9/synthetic-unavailable.png',
        ),
      );
      await _pump(
        tester,
        GarageRecentVehicleHero(onOpenVehicle: (_) {}, onBrowseVehicles: () {}),
      );
      // VM uses flutter_test's400 image mock. Chrome can only hit blocked
      // loopback port9, never a production or external image server.
      await _waitForImageFallback(tester);
      await tester.pumpAndSettle();
      expect(find.text('SYNTHETIC REMOTE MODEL'), findsOneWidget);
      expect(
        find.byKey(const Key('garage-recent-vehicle-placeholder')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('small screen and large text do not overflow', (tester) async {
    await seed();
    await _pump(tester, const GarageScreen(), width: 320, textScale: 1.6);
    expect(tester.takeException(), isNull);
    expect(
      tester.getSize(find.byKey(const Key('garage-recent-vehicle-hero'))).width,
      lessThanOrEqualTo(320),
    );
  });
}

final _captureBoundary = GlobalKey();

class _GarageTestAssetBundle extends CachingAssetBundle {
  @override
  Future<ByteData> load(String key) {
    if (key == 'AssetManifest.bin' || key == 'AssetManifest.bin.json') {
      // No synthetic image has resolution variants. Avoid browser-runner
      // manifest transport influencing this errorBuilder unit test; release
      // staging separately verifies the actual packaged image and manifest.
      final manifest = const StandardMessageCodec().encodeMessage(
        <String, Object?>{},
      )!;
      if (key.endsWith('.json')) {
        return SynchronousFuture(
          ByteData.sublistView(
            Uint8List.fromList(
              utf8.encode(
                jsonEncode(base64Encode(manifest.buffer.asUint8List())),
              ),
            ),
          ),
        );
      }
      return SynchronousFuture(manifest);
    }
    // The browser runner may serve an HTML fallback for a missing asset.
    // Inject the same missing-file error deterministically on both platforms,
    // without changing the widget's errorBuilder or the real photo assets.
    if (key == 'assets/cars/Kia/nonexistent-synthetic.png') {
      return Future<ByteData>.error(
        FlutterError('Synthetic missing car image'),
      );
    }
    return rootBundle.load(key);
  }
}

Future<void> _waitForImageFallback(WidgetTester tester) async {
  final placeholder = find.byKey(
    const Key('garage-recent-vehicle-placeholder'),
  );
  for (
    var attempt = 0;
    attempt < 80 && placeholder.evaluate().isEmpty;
    attempt++
  ) {
    // Chrome decodes image/error events outside the widget fake clock.
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 25)),
    );
    await tester.pump();
  }
}

Future<void> _pump(
  WidgetTester tester,
  Widget screen, {
  double width = 390,
  double textScale = 1,
}) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  if (_captureDir.isNotEmpty) {
    await (FontLoader('Pretendard')..addFont(
          rootBundle.load('assets/fonts/pretendard/PretendardVariable.ttf'),
        ))
        .load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  }
  await tester.pumpWidget(
    RepaintBoundary(
      key: _captureBoundary,
      child: DefaultAssetBundle(
        bundle: _GarageTestAssetBundle(),
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(textScale)),
            child: child!,
          ),
          home: Scaffold(
            body: Column(
              children: [
                if (_captureDir.isNotEmpty)
                  const SafeArea(
                    bottom: false,
                    child: Text('합성 데이터 · Flutter UI 미리보기'),
                  ),
                Expanded(child: screen),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  if (_captureDir.isNotEmpty) {
    await tester.runAsync(() async {
      for (final path in [
        'assets/images/garage/garage_home_bg.png',
        'assets/danawa/kia_모닝_360.png',
        'assets/danawa/kia_쏘렌토_360.png',
      ]) {
        await precacheImage(AssetImage(path), _captureBoundary.currentContext!);
      }
    });
  }
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pump(const Duration(milliseconds: 300));
}

String? _vehicleAsset(WidgetTester tester) => tester
    .widgetList<Image>(
      find.descendant(
        of: find.byKey(const Key('garage-recent-vehicle-hero')),
        matching: find.byType(Image),
      ),
    )
    .map((image) => image.image)
    .whereType<AssetImage>()
    .map((image) => image.assetName)
    .where((asset) => asset != 'assets/images/garage/garage_home_bg.png')
    .firstOrNull;

Future<void> _capture(WidgetTester tester, String filename) async {
  if (_captureDir.isEmpty) return;
  await tester.runAsync(() async {
    final image =
        await (_captureBoundary.currentContext!.findRenderObject()
                as RenderRepaintBoundary)
            .toImage(pixelRatio: 2);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(_captureDir).create(recursive: true);
    await File(
      '$_captureDir/$filename',
    ).writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

Future<void> _login() => AuthSession.instance.setSession(
  accessToken: 'SYNTHETIC-TOKEN',
  user: const AuthUser(
    id: 'synthetic-user',
    email: 'synthetic@example.invalid',
    fullName: '합성 고객',
    phoneNumber: null,
    role: 'CUSTOMER',
    isActive: true,
  ),
);

const _privateApplication = ApplicationEnvelope(
  traceId: 'SYNTHETIC',
  data: ApplicationResponse(
    id: 'private-application',
    userId: 'another-user',
    vehicleId: 'private-vehicle',
    vehicleBrand: 'SYNTHETIC',
    applicantType: 'INDIVIDUAL',
    status: 'SUBMITTED',
    vehicleName: 'SYNTHETIC PRIVATE APPLICATION',
    createdAt: null,
    updatedAt: null,
  ),
);

class _GarageInterceptor extends Interceptor {
  final requests = <String>[];
  bool empty = false;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    requests.add(options.path);
    final isApplications = options.path == '/api/v1/applications/me';
    handler.resolve(
      Response(
        requestOptions: options,
        statusCode: 200,
        data: {
          if (isApplications)
            'data': empty
                ? []
                : [
                    {
                      'id': 'synthetic-report',
                      'user_id': 'synthetic-user',
                      'vehicle_id': 'synthetic-quote-vehicle',
                      'vehicle_brand': '기아',
                      'vehicle_name': 'SYNTHETIC QUOTE VEHICLE',
                      'status': 'SUBMITTED',
                      'product_type': 'RENTAL',
                      'monthly_payment': 321000,
                      'created_at': '2026-10-20T01:00:00Z',
                    },
                  ]
          else
            'items': [],
          'meta': {'trace_id': 'SYNTHETIC'},
        },
      ),
    );
  }
}
