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
  final rows = jsonDecode(
          File('test/fixtures/ray_quotes_20261016.json').readAsStringSync())
      as List;
  SharedPreferences.setMockInitialValues({});
  for (var index = 0; index < rows.length; index++) {
    test(
        'recorded Ray quote $index preserves the returned amount and selection',
        () async {
      final row = rows[index] as Map<String, dynamic>;
      final request = row['request'] as Map<String, dynamic>;
      final interceptor = InterceptorsWrapper(onRequest: (options, handler) {
        handler.resolve(Response(
            requestOptions: options,
            statusCode: row['status'] as int,
            data: row['response']));
      });
      ApiClient.dio.interceptors.add(interceptor);
      addTearDown(() => ApiClient.dio.interceptors.remove(interceptor));
      final selection = QuoteSelection.fromJson(
          Map<String, dynamic>.from(request['selection'] as Map));
      final quote = await QuoteApi.createInstantQuote(
        vehicleId: request['vehicle_id'] as String,
        selection: selection,
        productType: request['product_type'] as String,
        term: request['term'] as int,
        mileageLimit: request['mileage_limit'] as int,
        prepaymentPct: request['prepayment_pct'] as int,
        guarantee: request['guarantee'] as int,
      );
      expect(quote.data.normalizedSelection, selection);
      expect(quote.data.hasSelectionPricingProof, isTrue);
      expect(quote.data.monthlyPayment,
          row['response']['data']['monthly_payment']);
    });
  }
}
