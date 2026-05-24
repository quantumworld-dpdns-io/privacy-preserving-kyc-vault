// location proof
// Generated: KYC Vault - Privacy Preserving Identity
// Proves that a user's location is within a defined geographic region

fn main(
    latitude: Field,
    longitude: Field,
    min_lat: pub Field,
    max_lat: pub Field,
    min_lon: pub Field,
    max_lon: pub Field,
) -> pub bool {
    constrain latitude >= min_lat;
    constrain latitude <= max_lat;
    constrain longitude >= min_lon;
    constrain longitude <= max_lon;

    true
}

fn is_in_bounding_box(lat: Field, lon: Field, min_lat: Field, max_lat: Field, min_lon: Field, max_lon: Field) -> bool {
    (lat >= min_lat) & (lat <= max_lat) & (lon >= min_lon) & (lon <= max_lon)
}

fn compute_location_hash(lat: Field, lon: Field) -> Field {
    (lat * 10000 + lon) % 65537
}

fn region_overlap(
    a_min_lat: Field, a_max_lat: Field, a_min_lon: Field, a_max_lon: Field,
    b_min_lat: Field, b_max_lat: Field, b_min_lon: Field, b_max_lon: Field,
) -> bool {
    let lat_overlap = (a_min_lat <= b_max_lat) & (a_max_lat >= b_min_lat);
    let lon_overlap = (a_min_lon <= b_max_lon) & (a_max_lon >= b_min_lon);
    lat_overlap & lon_overlap
}

fn region_contains(
    lat: Field, lon: Field,
    min_lat: Field, max_lat: Field, min_lon: Field, max_lon: Field,
) -> bool {
    (lat >= min_lat) & (lat <= max_lat) & (lon >= min_lon) & (lon <= max_lon)
}

#[test]
fn test_location_proof_inside() {
    let result = main(40, 50, 30, 60, 40, 70);
    assert(result);
}

#[test]
fn test_location_proof_outside_lat() {
    let result = main(20, 50, 30, 60, 40, 70);
    assert(result == false);
}

#[test]
fn test_location_proof_outside_lon() {
    let result = main(40, 80, 30, 60, 40, 70);
    assert(result == false);
}

#[test]
fn test_is_in_bounding_box() {
    assert(is_in_bounding_box(50, 50, 0, 100, 0, 100));
    assert(!is_in_bounding_box(101, 50, 0, 100, 0, 100));
    assert(!is_in_bounding_box(50, 101, 0, 100, 0, 100));
}

#[test]
fn test_region_overlap() {
    assert(region_overlap(0, 50, 0, 50, 25, 75, 25, 75));
    assert(!region_overlap(0, 10, 0, 10, 20, 30, 20, 30));
}

#[test]
fn test_region_contains() {
    assert(region_contains(50, 50, 0, 100, 0, 100));
    assert(!region_contains(150, 50, 0, 100, 0, 100));
}
