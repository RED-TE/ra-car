import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/utils/vehicle_image_resolver.dart';

void main() {
  const corrected = 'assets/cars/Genesis/gv70_verified_20261109.png';
  const electric = 'assets/danawa/genesis_electrified_gv70_360.png';

  for (final model in ['GV70', 'GV70(JK F/L)', '제네시스 GV70']) {
    test('$model uses the verified GV70 photo instead of the wrong legacy file',
        () {
      expect(
          resolveVehicleAsset(
              brand: 'Genesis',
              modelName: model,
              thumbnailUrl: 'assets/cars/Genesis/GV70_360.png'),
          corrected);
    });
  }
  for (final model in [
    'GV70 EV',
    'Electrified GV70',
    'e-GV70(JK F/L)',
    'GV70 전동화'
  ]) {
    test('$model keeps the electrified GV70 photo', () {
      expect(
          resolveVehicleAsset(
              brand: 'Genesis',
              modelName: model,
              thumbnailUrl: 'assets/cars/Genesis/GV70_360.png'),
          electric);
    });
  }
  for (final oldPath in [
    'assets/cars/Genesis/GV70_360.png',
    'assets/cars/Genesis/gv70_jk_f_l_360.png',
    'assets/danawa/genesis_gv70_360.png',
    'assets/vehicles/genesis_gv70_360.png',
  ]) {
    test('legacy asset $oldPath resolves to the new cache key', () {
      expect(normalizeVehicleAssetPath(oldPath), corrected);
    });
    test('API legacy photo $oldPath cannot bypass correction through HTTP', () {
      final raw = 'https://api.recarplan.com/$oldPath?v=old#photo';
      const expected =
          'https://api.recarplan.com/assets/cars/Genesis/gv70_verified_20261109.png?v=old#photo';
      expect(resolveVehicleNetworkImage(thumbnailUrl: raw), expected);
      expect(resolveHostedVehicleImageUrl(raw), expected);
    });
  }
  test('electric quote cannot reuse the non-electric legacy HTTP photo', () {
    expect(
        resolveVehicleNetworkImage(
            thumbnailUrl:
                'https://api.recarplan.com/assets/cars/Genesis/GV70_360.png',
            brand: 'Genesis',
            modelName: 'GV70 EV'),
        'https://api.recarplan.com/assets/danawa/genesis_electrified_gv70_360.png');
  });
  for (final identity in [
    ['Genesis', 'GV80'],
    ['Kia', 'GV70'],
  ]) {
    test('explicit other vehicle keeps its URL: $identity', () {
      const raw = 'https://api.recarplan.com/assets/cars/Genesis/GV70_360.png';
      expect(
          resolveVehicleNetworkImage(
              thumbnailUrl: raw, brand: identity[0], modelName: identity[1]),
          raw);
      expect(
          resolveHostedVehicleImageUrl(raw,
              brand: identity[0], modelName: identity[1]),
          raw);
    });
  }
  test('hosted legacy asset keeps electric model context', () {
    final image = resolveHostedVehicleImageUrl(
        'assets/vehicles/genesis_gv70_360.png',
        brand: 'Genesis',
        modelName: 'GV70 EV');
    expect(Uri.parse(image!).path,
        '/assets/danawa/genesis_electrified_gv70_360.png');
  });
  test('hosted color asset remains unchanged with electric model context', () {
    final image = resolveHostedVehicleImageUrl(
        'assets/chazm-colors/gv70/white.png',
        brand: 'Genesis',
        modelName: 'GV70 EV');
    expect(Uri.parse(image!).path, '/assets/chazm-colors/gv70/white.png');
  });
  for (final host in ['recarplan.com', 'www.recarplan.com']) {
    test('root web legacy asset uses the served app bundle on $host', () {
      final raw = 'https://$host/assets/assets/cars/Genesis/GV70_360.png';
      final expected =
          'https://$host/app/assets/assets/cars/Genesis/gv70_verified_20261109.png';
      expect(resolveVehicleNetworkImage(thumbnailUrl: raw), expected);
      expect(resolveHostedVehicleImageUrl(raw), expected);
    });
  }
  for (final prefix in ['/assets/assets/', '/app/assets/assets/']) {
    test('API legacy bundle prefix $prefix resolves to the API asset mount',
        () {
      final raw = 'https://api.recarplan.com${prefix}cars/Genesis/GV70_360.png';
      const expected =
          'https://api.recarplan.com/assets/cars/Genesis/gv70_verified_20261109.png';
      expect(resolveVehicleNetworkImage(thumbnailUrl: raw), expected);
      expect(resolveHostedVehicleImageUrl(raw), expected);
    });
  }
  test('web bundled legacy photo uses a fresh bundled asset path', () {
    expect(
        resolveVehicleNetworkImage(
            thumbnailUrl:
                'https://recarplan.com/app/assets/assets/cars/Genesis/GV70_360.png'),
        'https://recarplan.com/app/assets/assets/cars/Genesis/gv70_verified_20261109.png');
  });
  for (final url in [
    'https://api.recarplan.com',
    'https://photos.example/assets/cars/Genesis/GV70_360.png',
    'https://api.recarplan.com/uploads/gv70-owner-photo.png',
    'https://api.recarplan.com/assets/chazm-colors/gv70/white.png',
    'https://api.recarplan.com/assets/danawa/genesis_electrified_gv70_360.png',
  ]) {
    test('custom, color and electric URL is preserved: $url', () {
      expect(resolveVehicleNetworkImage(thumbnailUrl: url), url);
      expect(resolveHostedVehicleImageUrl(url), url);
    });
  }
}
