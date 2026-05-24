from __future__ import annotations

import argparse
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


def start_server(args: argparse.Namespace) -> None:
    from flwr.fraud_detection.server import run_server

    logger.info("Starting Flower server on %s ...", args.server_address)
    run_server(
        input_dim=args.input_dim,
        num_rounds=args.rounds,
        min_fit_clients=args.min_clients,
        min_available_clients=args.min_clients,
        server_address=args.server_address,
    )


def start_client(args: argparse.Namespace) -> None:
    import flwr as fl
    from flwr.fraud_detection.client import FraudDetectionClient

    client = FraudDetectionClient(
        client_id=args.client_id,
        input_dim=args.input_dim,
        learning_rate=args.lr,
        client_bias=args.client_bias,
        n_samples=args.n_samples,
    )
    logger.info(
        "Starting Flower client %d connecting to %s ...",
        args.client_id,
        args.server_address,
    )
    fl.client.start_numpy_client(
        server_address=args.server_address,
        client=client,
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Federated KYC Fraud Detection (Flower)"
    )
    parser.add_argument(
        "--role",
        type=str,
        choices=["server", "client"],
        default="server",
        help="Run as server or client",
    )
    parser.add_argument(
        "--server_address",
        type=str,
        default="127.0.0.1:8080",
        help="gRPC server address",
    )
    parser.add_argument("--rounds", type=int, default=10, help="Number of FL rounds")
    parser.add_argument(
        "--min_clients", type=int, default=2, help="Minimum number of clients"
    )
    parser.add_argument("--input_dim", type=int, default=20, help="Feature dimension")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
    parser.add_argument(
        "--client_id", type=int, default=0, help="Client ID (used in client mode)"
    )
    parser.add_argument(
        "--client_bias",
        type=float,
        default=0.0,
        help="Non-IID bias for client data",
    )
    parser.add_argument(
        "--n_samples",
        type=int,
        default=800,
        help="Training samples per client",
    )
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    if args.role == "server":
        start_server(args)
    else:
        start_client(args)


if __name__ == "__main__":
    main()
