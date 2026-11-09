// SYNTHETIC ONLY. Exercise the preserved web compatibility entry point.
import 'package:flutter_test/flutter_test.dart';
import 'package:recar_app/models/quote_selection.dart';
import 'package:recar_app/services/quote_api.dart';

import 'support/actual_synthetic_selection_conditions.dart';

void main() {
  for (final name in const [
    'conditions_24m_40000km_advance0',
    'conditions_24m_40000km_advance20',
    'approved_alias_guarantee_knownFalse',
    'approved_alias_guarantee_knownTrue',
  ]) {
    for (final optIn in [false, true]) {
      test('web compatibility validates $name only with opt-in $optIn', () {
        final fixture = actualSyntheticConditions(name);
        final request = fixture['quote_request'] as Map<String, dynamic>;
        final data = fixture['quote_response']['data'] as Map<String, dynamic>;
        void validate() => QuoteApi.validateSelectionResponse(
              data,
              vehicleId: request['vehicle_id'],
              selection: QuoteSelection.fromJson(request['selection']),
              productType: request['product_type'],
              term: request['term'],
              mileageLimit: request['mileage_limit'],
              deposit: request['deposit'],
              guarantee: request['guarantee'],
              prepaymentPct: request['prepayment_pct'],
              guaranteePct: request['guarantee_pct'],
              allowSelectionConditionsEstimate: optIn,
            );
        expect(validate,
            optIn ? returnsNormally : throwsA(isA<QuoteConditionsUnverified>()));
      });
    }
  }
}
