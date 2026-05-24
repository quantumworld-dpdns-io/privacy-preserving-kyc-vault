use std::time::{Instant, Duration};
use thiserror::Error;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

/// Quantum benchmarking suite for performance evaluation
pub mod benchmarking {
    use super::*;

    #[derive(Debug, Error)]
    pub enum BenchmarkError {
        #[error("Benchmark execution failed")]
        ExecutionFailed,
        
        #[error("Invalid benchmark configuration")]
        InvalidConfiguration,
        
        #[error("Measurement failed")]
        MeasurementFailed,
    }

    /// Benchmark configuration
    #[derive(Debug, Clone)]
    pub struct BenchmarkConfig {
        pub name: String,
        pub iterations: usize,
        pub warmup_iterations: usize,
        pub timeout_seconds: u64,
    }

    impl Default for BenchmarkConfig {
        fn default() -> Self {
            Self {
                name: "unnamed_benchmark".to_string(),
                iterations: 100,
                warmup_iterations: 10,
                timeout_seconds: 30,
            }
        }
    }

    /// Benchmark result
    #[derive(Debug, Clone)]
    pub struct BenchmarkResult {
        pub name: String,
        pub iterations: usize,
        pub total_time: Duration,
        pub mean_time: Duration,
        pub median_time: Duration,
        pub min_time: Duration,
        pub max_time: Duration,
        pub std_dev: Duration,
        pub operations_per_second: f64,
    }

    /// Quantum algorithm benchmarker
    pub struct QuantumBenchmarker {
        config: BenchmarkConfig,
    }

    impl QuantumBenchmarker {
        pub fn new(config: BenchmarkConfig) -> Self {
            Self { config }
        }

        pub fn default() -> Self {
            Self::new(BenchmarkConfig::default())
        }

        /// Run a benchmark function and collect statistics
        pub fn benchmark<F>(&mut self, mut f: F) -> Result<BenchmarkResult, BenchmarkError>
        where
            F: FnMut() -> Result<(), BenchmarkError>,
        {
            // Warmup phase
            for _ in 0..self.config.warmup_iterations {
                if let Err(e) = f() {
                    return Err(BenchmarkError::ExecutionFailed);
                }
            }

            // Measurement phase
            let mut times = Vec::with_capacity(self.config.iterations);
            
            for i in 0..self.config.iterations {
                let start = Instant::now();
                if let Err(e) = f() {
                    return Err(BenchmarkError::ExecutionFailed);
                }
                let duration = start.elapsed();
                times.push(duration);
                
                // Check for timeout
                if duration.as_secs() > self.config.timeout_seconds {
                    return Err(BenchmarkError::MeasurementFailed);
                }
            }

            // Calculate statistics
            let total_time: Duration = times.iter().sum();
            let mean_time = total_time / self.config.iterations as u32;
            
            // Calculate median
            let mut sorted_times = times.clone();
            sorted_times.sort_by_key(|&d| d.as_nanos());
            let median_time = if sorted_times.len() % 2 == 0 {
                let mid = sorted_times.len() / 2;
                Duration::from_nanos(
                    ((sorted_times[mid-1].as_nanos() + sorted_times[mid].as_nanos()) / 2) as u64
                )
            } else {
                sorted_times[sorted_times.len() / 2]
            };
            
            // Find min and max
            let min_time = *times.iter().min_by_key(|&d| d.as_nanos()).unwrap();
            let max_time = *times.iter().max_by_key(|&d| d.as_nanos()).unwrap();
            
            // Calculate standard deviation
            let mean_nanos = mean_time.as_nanos() as f64;
            let variance: f64 = times.iter()
                .map(|d| {
                    let diff = d.as_nanos() as f64 - mean_nanos;
                    diff * diff
                })
                .sum::<f64>() / self.config.iterations as f64;
            let std_dev_nanos = variance.sqrt();
            let std_dev = Duration::from_nanos(std_dev_nanos as u64);
            
            // Calculate operations per second
            let ops_per_second = if mean_time.as_secs_f64() > 0.0 {
                1.0 / mean_time.as_secs_f64()
            } else {
                f64::INFINITY
            };

            Ok(BenchmarkResult {
                name: self.config.name.clone(),
                iterations: self.config.iterations,
                total_time,
                mean_time,
                median_time,
                min_time,
                max_time,
                std_dev,
                operations_per_second: ops_per_second,
            })
        }

        /// Benchmark quantum algorithm execution time
        pub fn benchmark_algorithm<F, T>(&mut self, mut f: F) -> Result<BenchmarkResult, BenchmarkError>
        where
            F: FnMut() -> Result<T, BenchmarkError>,
        {
            // Warmup phase
            for _ in 0..self.config.warmup_iterations {
                if let Err(_) = f() {
                    return Err(BenchmarkError::ExecutionFailed);
                }
            }

            // Measurement phase
            let mut times = Vec::with_capacity(self.config.iterations);
            let mut last_result = None;
            
            for i in 0..self.config.iterations {
                let start = Instant::now();
                let result = f();
                let duration = start.elapsed();
                
                if let Err(e) = result {
                    return Err(BenchmarkError::ExecutionFailed);
                }
                
                times.push(duration);
                last_result = result.ok();
                
                // Check for timeout
                if duration.as_secs() > self.config.timeout_seconds {
                    return Err(BenchmarkError::MeasurementFailed);
                }
            }

            // Calculate statistics (same as above)
            let total_time: Duration = times.iter().sum();
            let mean_time = total_time / self.config.iterations as u32;
            
            let mut sorted_times = times.clone();
            sorted_times.sort_by_key(|&d| d.as_nanos());
            let median_time = if sorted_times.len() % 2 == 0 {
                let mid = sorted_times.len() / 2;
                Duration::from_nanos(
                    ((sorted_times[mid-1].as_nanos() + sorted_times[mid].as_nanos()) / 2) as u64
                )
            } else {
                sorted_times[sorted_times.len() / 2]
            };
            
            let min_time = *times.iter().min_by_key(|&d| d.as_nanos()).unwrap();
            let max_time = *times.iter().max_by_key(|&d| d.as_nanos()).unwrap();
            
            let mean_nanos = mean_time.as_nanos() as f64;
            let variance: f64 = times.iter()
                .map(|d| {
                    let diff = d.as_nanos() as f64 - mean_nanos;
                    diff * diff
                })
                .sum::<f64>() / self.config.iterations as f64;
            let std_dev_nanos = variance.sqrt();
            let std_dev = Duration::from_nanos(std_dev_nanos as u64);
            
            let ops_per_second = if mean_time.as_secs_f64() > 0.0 {
                1.0 / mean_time.as_secs_f64()
            } else {
                f64::INFINITY
            };

            Ok(BenchmarkResult {
                name: self.config.name.clone(),
                iterations: self.config.iterations,
                total_time,
                mean_time,
                median_time,
                min_time,
                max_time,
                std_dev,
                operations_per_second: ops_per_second,
            })
        }
    }

    /// Specific quantum algorithm benchmarks
    pub struct QuantumAlgorithmBenchmarks;

    impl QuantumAlgorithmBenchmarks {
        /// Benchmark Grover's search algorithm
        pub fn grovers_search(database_size: usize, iterations: usize) -> Result<BenchmarkResult, BenchmarkError> {
            use super::algorithms::GroverSearch;
            
            let mut benchmarker = QuantumBenchmarker::new(BenchmarkConfig {
                name: format!("GroversSearch_{}", database_size),
                iterations,
                ..Default::default()
            });
            
            // Create oracle that marks the middle element
            let marked_item = database_size / 2;
            let oracle = move |x: usize| x == marked_item;
            
            benchmarker.benchmark(|| {
                let grover = GroverSearch::new(database_size);
                let _ = grover.search(&oracle, database_size);
                Ok(())
            })
        }

        /// Benchmark Shor's algorithm factorization
        pub fn shors_algorithm(number: u64, iterations: usize) -> Result<BenchmarkResult, BenchmarkError> {
            use super::algorithms::ShorsAlgorithm;
            
            let mut benchmarker = QuantumBenchmarker::new(BenchmarkConfig {
                name: format!("ShorsAlgorithm_{}", number),
                iterations,
                ..Default::default()
            });
            
            let shor = ShorsAlgorithm;
            
            benchmarker.benchmark(|| {
                let _ = shor.factorize(number);
                Ok(())
            })
        }

        /// Benchmark Quantum Fourier Transform
        pub fn quantum_fourier_transform(vector_size: usize, iterations: usize) -> Result<BenchmarkResult, BenchmarkError> {
            use super::algorithms::QuantumFourierTransform;
            use ndarray::array;
            use num_complex::Complex64;
            
            let mut benchmarker = QuantumBenchmarker::new(BenchmarkConfig {
                name: format!("QFT_{}", vector_size),
                iterations,
                ..Default::default()
            });
            
            // Create test state
            let mut state = array![Complex64::new(0.0, 0.0); vector_size];
            state[0] = Complex64::new(1.0, 0.0); // |0> state
            
            let qft = QuantumFourierTransform;
            
            benchmarker.benchmark(|| {
                let _ = qft.transform(&state);
                Ok(())
            })
        }

        /// Benchmark VQE (Variational Quantum Eigensolver)
        pub fn vqe(matrix_size: usize, iterations: usize) -> Result<BenchmarkResult, BenchmarkError> {
            use super::algorithms::VQE;
            use ndarray::Array2;
            use num_complex::Complex64;
            
            let mut benchmarker = QuantumBenchmarker::new(BenchmarkConfig {
                name: format!("VQE_{}x{}", matrix_size, matrix_size),
                iterations,
                ..Default::default()
            });
            
            // Create random Hermitian matrix
            let mut rng = StdRng::from_entropy();
            let mut hamiltonian = Array2::zeros((matrix_size, matrix_size));
            
            for i in 0..matrix_size {
                for j in 0..matrix_size {
                    let re = rng.gen_range(-1.0..1.0);
                    let im = rng.gen_range(-1.0..1.0);
                    hamiltonian[[i, j]] = Complex64::new(re, im);
                    // Make Hermitian
                    hamiltonian[[j, i]] = Complex64::new(re, -im);
                }
            }
            
            let mut vqe = VQE::new(matrix_size * 2); // 2 parameters per matrix element
            vqe.set_parameters(vec![0.1; matrix_size * 2]);
            
            benchmarker.benchmark(|| {
                let _ = vqe.compute_energy(&hamiltonian);
                Ok(())
            })
        }

        /// Benchmark quantum error correction
        pub fn error_correction(code_type: super::error_correction::CodeType, iterations: usize) -> Result<BenchmarkResult, BenchmarkError> {
            use super::error_correction::ErrorCorrection;
            
            let mut benchmarker = QuantumBenchmarker::new(BenchmarkConfig {
                name: format!("ErrorCorrection_{:?}", code_type),
                iterations,
                ..Default::default()
            });
            
            let ec = ErrorCorrection::new();
            let state = true;
            
            benchmarker.benchmark(move || {
                let encoded = ec.encode_state(state, code_type);
                let _ = ec.correct_state(encoded, code_type)?;
                let _ = ec.decode_state(encoded, code_type);
                Ok(())
            })
        }

        /// Benchmark quantum random number generation
        pub fn qrng(bytes: usize, iterations: usize) -> Result<BenchmarkResult, BenchmarkError> {
            use super::random_number_gen::QRNGService;
            
            let mut benchmarker = QuantumBenchmarker::new(BenchmarkConfig {
                name: format!("QRNG_{}bytes", bytes),
                iterations,
                ..Default::default()
            });
            
            let mut service = QRNGService::new();
            
            benchmarker.benchmark(move || {
                let _ = service.generate_key(bytes)?;
                Ok(())
            })
        }

        /// Benchmark quantum key distribution
        pub fn qkd(protocol: super::key_distribution::QKDProtocol, key_length: usize, iterations: usize) -> Result<BenchmarkResult, BenchmarkError> {
            use super::key_distribution::QKDService;
            
            let mut benchmarker = QuantumBenchmarker::new(BenchmarkConfig {
                name: format!("QKD_{:}_{}bits", protocol, key_length),
                iterations,
                ..Default::default()
            });
            
            let qkd = QKDService::new();
            
            benchmarker.benchmark(move || {
                match protocol {
                    super::key_distribution::QKDProtocol::BB84 => {
                        let _ = qkd.bb84(key_length)?;
                    }
                    super::key_distribution::QKDProtocol::E91 => {
                        let _ = qkd.e91(key_length)?;
                    }
                    super::key_distribution::QKDProtocol::DeviceIndependent => {
                        let _ = qkd.device_independent(key_length, 2.0)?;
                    }
                }
                Ok(())
            })
        }

        /// Benchmark quantum machine learning
        pub fn qml(model_type: super::ml_models::QMLModelType, feature_size: usize, iterations: usize) -> Result<BenchmarkResult, BenchmarkError> {
            use super::ml_models::{QuantumEnhancedClassifier, QuantumNeuralNetwork, QuantumAnomalyDetector};
            use ndarray::{Array2, Array1};
            
            let mut benchmarker = QuantumBenchmarker::new(BenchmarkConfig {
                name: format!("QML_{:}_{}features", model_type, feature_size),
                iterations,
                ..Default::default()
            });
            
            // Create test data
            let mut rng = StdRng::from_entropy();
            let features = Array2::from_shape_fn((iterations, feature_size), |(i, j)| {
                rng.gen_range(0.0..1.0)
            });
            let labels = Array1::from_shape_fn(iterations, |i| (i % 2) as usize); // Binary labels
            
            match model_type {
                super::ml_models::QMLModelType::EnhancedClassifier => {
                    let mut classifier = QuantumEnhancedClassifier::new(feature_size, 2);
                    benchmarker.benchmark(move || {
                        // Train on a subset
                        let train_features = features.slice(s![0..(iterations/2), ..]).to_owned();
                        let train_labels = labels.slice(s![0..(iterations/2)]).to_owned();
                        let _ = classifier.train(&train_features, &train_labels, 0.01, 5)?;
                        
                        // Predict on remaining
                        let test_features = features.slice(s![(iterations/2).., ..]).to_owned();
                        let _ = classifier.predict(&test_features)?;
                        Ok(())
                    })
                }
                super::ml_models::QMLModelType::NeuralNetwork => {
                    let mut nn = QuantumNeuralNetwork::new(&[feature_size, 8, 2]);
                    benchmarker.benchmark(move || {
                        // Train on a subset
                        let train_features = features.slice(s![0..(iterations/2), ..]).to_owned();
                        let train_labels = labels.slice(s![0..(iterations/2)]).to_owned();
                        let _ = nn.train(&train_features, &train_labels, 0.01, 5)?;
                        
                        // Predict on remaining
                        let test_features = features.slice(s![(iterations/2).., ..]).to_owned();
                        let _ = nn.predict(&test_features)?;
                        Ok(())
                    })
                }
                super::ml_models::QMLModelType::AnomalyDetector => {
                    let mut detector = QuantumAnomalyDetector::new();
                    benchmarker.benchmark(move || {
                        // Train on a subset
                        let train_features = features.slice(s![0..(iterations/2), ..]).to_owned();
                        let _ = detector.train(&train_features)?;
                        
                        // Detect anomalies on remaining
                        let test_features = features.slice(s![(iterations/2).., ..]).to_owned();
                        let _ = detector.detect_anomalies(&test_features)?;
                        Ok(())
                    })
                }
            }
        }

        /// Run a complete benchmark suite
        pub fn run_suite() -> Result<Vec<BenchmarkResult>, BenchmarkError> {
            let mut results = Vec::new();
            
            // Add some basic benchmarks
            results.push(Self::grovers_search(16, 10)?);
            results.push(Self::shors_algorithm(15, 10)?);
            results.push(Self::quantum_fourier_transform(8, 10)?);
            results.push(Self::vqe(4, 10)?);
            
            // Error correction benchmarks
            use super::error_correction::CodeType;
            results.push(Self::error_correction(CodeType::BitFlip, 10)?);
            results.push(Self::error_correction(CodeType::PhaseFlip, 10)?);
            results.push(Self::error_correction(CodeType::Shor, 10)?);
            
            // QRNG benchmark
            results.push(Self::qrng(32, 10)?);
            
            // QKD benchmarks
            use super::key_distribution::QKDProtocol;
            results.push(Self::qkd(QKDProtocol::BB84, 128, 5)?);
            results.push(Self::qkd(QKDProtocol::E91, 128, 5)?);
            results.push(Self::qkd(QKDProtocol::DeviceIndependent, 128, 5)?);
            
            // QML benchmarks
            use super::ml_models::QMLModelType;
            results.push(Self::qml(QMLModelType::EnhancedClassifier, 4, 5)?);
            results.push(Self::qml(QMLModelType::NeuralNetwork, 4, 5)?);
            results.push(Self::qml(QMLModelType::AnomalyDetector, 4, 5)?);
            
            Ok(results)
        }
    }

    /// Benchmark reporter for formatting and outputting results
    pub struct BenchmarkReporter;

    impl BenchmarkReporter {
        /// Format a benchmark result as a human-readable string
        pub fn format_result(result: &BenchmarkResult) -> String {
            format!(
                "Benchmark: {}\n\
                 Iterations: {}\n\
                 Total time: {:?}\n\
                 Mean time: {:?}\n\
                 Median time: {:?}\n\
                 Min time: {:?}\n\
                 Max time: {:?}\n\
                 Std dev: {:?}\n\
                 Operations/sec: {:.2}\n",
                result.name,
                result.iterations,
                result.total_time,
                result.mean_time,
                result.median_time,
                result.min_time,
                result.max_time,
                result.std_dev,
                result.operations_per_second
            )
        }

        /// Format multiple benchmark results
        pub fn format_results(results: &[BenchmarkResult]) -> String {
            let mut output = String::new();
            output.push_str("=== Quantum Benchmarking Suite Results ===\n\n");
            
            for result in results {
                output.push_str(&Self::format_result(result));
                output.push_str("\n");
            }
            
            output
        }

        /// Save benchmark results to CSV
        pub fn to_csv(results: &[BenchmarkResult]) -> String {
            let mut csv = String::new();
            csv.push_str("Name,Iterations,TotalTimeNs,MeanTimeNs,MedianTimeNs,MinTimeNs,MaxTimeNs,StdDevNs,OpsPerSec\n");
            
            for result in results {
                csv.push_str(&format!(
                    "\"{}\",{},{},{},{},{},{},{},{}\n",
                    result.name.replace('\"', ""),
                    result.iterations,
                    result.total_time.as_nanos(),
                    result.mean_time.as_nanos(),
                    result.median_time.as_nanos(),
                    result.min_time.as_nanos(),
                    result.max_time.as_nanos(),
                    result.std_dev.as_nanos(),
                    result.operations_per_second
                ));
            }
            
            csv
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::thread;
        use std::time::Duration as StdDuration;

        #[test]
        fn test_benchmark_config_default() {
            let config = BenchmarkConfig::default();
            assert_eq!(config.iterations, 100);
            assert_eq!(config.warmup_iterations, 10);
            assert_eq!(config.timeout_seconds, 30);
        }

        #[test]
        fn test_benchmark_result_creation() {
            let result = BenchmarkResult {
                name: "test".to_string(),
                iterations: 10,
                total_time: Duration::from_millis(100),
                mean_time: Duration::from_millis(10),
                median_time: Duration::from_millis(10),
                min_time: Duration::from_millis(5),
                max_time: Duration::from_millis(20),
                std_dev: Duration::from_millis(2),
                operations_per_second: 100.0,
            };
            
            assert_eq!(result.name, "test");
            assert_eq!(result.iterations, 10);
        }

        #[test]
        fn test_quantum_benchmarker_basic() {
            let mut benchmarker = QuantumBenchmarker::new(BenchmarkConfig {
                name: "test_benchmark".to_string(),
                iterations: 5,
                warmup_iterations: 1,
                timeout_seconds: 5,
            });
            
            let mut counter = 0usize;
            let result = benchmarker.benchmark(|| {
                counter += 1;
                Ok(())
            });
            
            assert!(result.is_ok());
            let result = result.unwrap();
            assert_eq!(result.name, "test_benchmark");
            assert_eq!(result.iterations, 5);
            assert_eq!(counter, 5 + 1); // 5 iterations + 1 warmup
        }

        #[test]
        fn test_benchmark_reporter_format() {
            let result = BenchmarkResult {
                name: "test".to_string(),
                iterations: 10,
                total_time: Duration::from_millis(100),
                mean_time: Duration::from_millis(10),
                median_time: Duration::from_millis(10),
                min_time: Duration::from_millis(5),
                max_time: Duration::from_millis(20),
                std_dev: Duration::from_millis(2),
                operations_per_second: 100.0,
            };
            
            let formatted = BenchmarkReporter::format_result(&result);
            assert!(formatted.contains("Benchmark: test"));
            assert!(formatted.contains("Iterations: 10"));
            assert!(formatted.contains("Operations/sec: 100.00"));
        }

        #[test]
        fn test_benchmark_reporter_csv() {
            let results = vec![
                BenchmarkResult {
                    name: "test1".to_string(),
                    iterations: 10,
                    total_time: Duration::from_millis(100),
                    mean_time: Duration::from_millis(10),
                    median_time: Duration::from_millis(10),
                    min_time: Duration::from_millis(5),
                    max_time: Duration::from_millis(20),
                    std_dev: Duration::from_millis(2),
                    operations_per_second: 100.0,
                },
                BenchmarkResult {
                    name: "test2".to_string(),
                    iterations: 20,
                    total_time: Duration::from_millis(200),
                    mean_time: Duration::from_millis(10),
                    median_time: Duration::from_millis(10),
                    min_time: Duration::from_millis(5),
                    max_time: Duration::from_millis(20),
                    std_dev: Duration::from_millis(2),
                    operations_per_second: 100.0,
                },
            ];
            
            let csv = BenchmarkReporter::to_csv(&results);
            assert!(csv.contains("test1"));
            assert!(csv.contains("test2"));
            assert!(csv.contains("Iterations"));
            assert!(csv.contains("TotalTimeNs"));
        }

        #[test]
        fn test_grovers_benchmark() {
            // This might take a moment to run
            let result = QuantumAlgorithmBenchmarks::grovers_search(8, 2);
            assert!(result.is_ok());
        }

        #[test]
        fn test_shors_benchmark() {
            let result = QuantumAlgorithmBenchmarks::shors_algorithm(15, 2);
            assert!(result.is_ok());
        }

        #[test]
        fn test_qft_benchmark() {
            let result = QuantumAlgorithmBenchmarks::quantum_fourier_transform(4, 2);
            assert!(result.is_ok());
        }

        #[test]
        fn test_vqe_benchmark() {
            let result = QuantumAlgorithmBenchmarks::vqe(2, 2);
            assert!(result.is_ok());
        }
    }
}