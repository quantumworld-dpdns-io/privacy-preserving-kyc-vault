pub fn hello() -> &'static str { "hello from crypto-pqc" }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn it_works() {
        assert_eq!(hello(), "hello from crypto-pqc");
    }
}
