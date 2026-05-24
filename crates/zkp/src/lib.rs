pub fn hello() -> &'static str { "hello from zkp" }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn it_works() {
        assert_eq!(hello(), "hello from zkp");
    }
}
