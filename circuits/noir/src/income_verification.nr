// income verification
// Generated: KYC Vault - Privacy Preserving Identity
// Proves that income meets or exceeds a threshold without revealing exact income

fn main(
    income: Field,
    threshold: pub Field,
    currency_code: Field,
) -> pub bool {
    constrain income >= threshold;

    const VALID_CURRENCY_USD: Field = 1;
    const VALID_CURRENCY_EUR: Field = 2;
    const VALID_CURRENCY_GBP: Field = 3;

    let valid_currency: bool = (currency_code == VALID_CURRENCY_USD)
        | (currency_code == VALID_CURRENCY_EUR)
        | (currency_code == VALID_CURRENCY_GBP);
    constrain valid_currency == true;

    let zero: Field = 0;
    constrain threshold >= zero;

    true
}

fn meets_threshold(value: Field, min: Field) -> bool {
    value >= min
}

fn convert_income(amount: Field, from_currency: Field, to_currency: Field, rate: Field) -> Field {
    let rate_applied: Field = amount * rate;
    rate_applied
}

fn income_bracket(value: Field) -> Field {
    if value < 30000 {
        1
    } else if value < 70000 {
        2
    } else if value < 150000 {
        3
    } else {
        4
    }
}

#[test]
fn test_income_verification_pass() {
    let result = main(75000, 50000, 1);
    assert(result);
}

#[test]
fn test_income_verification_below_threshold() {
    let result = main(30000, 50000, 1);
    assert(result == false);
}

#[test]
fn test_income_verification_invalid_currency() {
    let result = main(75000, 50000, 99);
    assert(result == false);
}

#[test]
fn test_meets_threshold() {
    assert(meets_threshold(100, 50));
    assert(meets_threshold(50, 50));
    assert(!meets_threshold(49, 50));
}

#[test]
fn test_income_bracket() {
    assert(income_bracket(20000) == 1);
    assert(income_bracket(50000) == 2);
    assert(income_bracket(100000) == 3);
    assert(income_bracket(200000) == 4);
}
