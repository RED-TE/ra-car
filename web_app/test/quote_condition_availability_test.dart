import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/models/quote_selection.dart';
import 'package:recar_app/services/api_client.dart';
import 'package:recar_app/services/quote_api.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});
  final rows = jsonDecode(File('test/fixtures/ray_condition_quotes_20261016.json')
      .readAsStringSync()) as List;

  for (final row in rows.cast<Map<String, dynamic>>()) {
    final request = row['request'] as Map<String, dynamic>;
    final response = row['response'] as Map<String, dynamic>;
    final verified = response['data']['price_provenance']
        ['request_conditions_verified'] == true;
    test('recorded Ray ${request['term']}m / ${request['mileage_limit']}km: '
        '${verified ? 'verified' : 'unverified price blocked'}', () async {
      final interceptor = InterceptorsWrapper(onRequest: (options, handler) {
        handler.resolve(Response(
            requestOptions: options, statusCode: row['status'], data: response));
      });
      ApiClient.dio.interceptors.add(interceptor);
      addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));
      final pending = QuoteApi.createInstantQuote(
        vehicleId: request['vehicle_id'],
        selection: QuoteSelection.fromJson(
            Map<String, dynamic>.from(request['selection'])),
        productType: request['product_type'],
        term: request['term'],
        mileageLimit: request['mileage_limit'],
        prepaymentPct: request['prepayment_pct'],
        guarantee: request['guarantee'],
      );
      if (verified) {
        expect((await pending).data.monthlyPayment,
            response['data']['monthly_payment']);
      } else {
        await expectLater(pending, throwsA(isA<QuoteConditionsUnverified>()));
      }
    });
  }
}
