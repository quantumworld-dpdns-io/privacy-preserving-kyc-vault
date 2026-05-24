// Go gRPC client for KYC Vault credential verification.
//
// Protobuf definitions are in proto/kyc_vault_common.proto.
// Generate with:
//   protoc --go_out=. --go-grpc_out=. proto/kyc_vault_common.proto
//
// Usage:
//   go run client.go --server localhost:50051 --credential-id abc-123

package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"time"

	pb "github.com/quantumworld-dpdns-io/kyc-vault/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	serverAddr := flag.String("server", "localhost:50051", "gRPC server address")
	credentialID := flag.String("credential-id", "550e8400-e29b-41d4-a716-446655440000", "Credential ID to verify")
	did := flag.String("did", "did:kyc:issuer:vault-001", "DID to resolve")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	conn, err := grpc.Dial(*serverAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		log.Fatalf("Failed to connect to %s: %v", *serverAddr, err)
	}
	defer conn.Close()
	log.Printf("Connected to gRPC server at %s", *serverAddr)

	// -----------------------------------------------------------------------
	// 1. Resolve a DID document
	// -----------------------------------------------------------------------
	didClient := pb.NewDIDResolverClient(conn)
	didResp, err := didClient.Resolve(ctx, &pb.DidIdentifier{
		Did:    *did,
		Method: "kyc",
		MethodSpecificId: *did,
	})
	if err != nil {
		log.Printf("DID resolve error (may be unimplemented): %v", err)
	} else {
		log.Printf("Resolved DID document: %s", didResp.Did)
	}

	// -----------------------------------------------------------------------
	// 2. Get credential metadata
	// -----------------------------------------------------------------------
	credClient := pb.NewCredentialServiceClient(conn)
	credResp, err := credClient.GetCredential(ctx, &pb.CredentialRef{
		Id: *credentialID,
	})
	if err != nil {
		log.Printf("GetCredential error: %v", err)
	} else {
		log.Printf("Credential: issuer=%s subject=%s issued=%d expires=%d",
			credResp.IssuerDid, credResp.SubjectDid, credResp.IssuedAt, credResp.ExpiresAt)
	}

	// -----------------------------------------------------------------------
	// 3. Generate a ZKP proof
	// -----------------------------------------------------------------------
	zkpClient := pb.NewZKPEngineClient(conn)

	// Create private inputs from random data
	privateInput := make([]byte, 32)
	rand.Read(privateInput)

	proofReq := &pb.ProofRequest{
		CircuitId:    "age_verification",
		PublicInputs: []string{"25", "21"},
		PrivateInputs: map[string][]byte{
			"age":  {25},        // private age
			"salt": privateInput, // random salt
		},
	}

	proofResp, err := zkpClient.GenerateProof(ctx, proofReq)
	if err != nil {
		log.Fatalf("GenerateProof error: %v", err)
	}
	log.Printf("Generated proof: id=%s circuit=%s time=%dms",
		proofResp.ProofId, proofResp.CircuitId, proofResp.ProvingTimeMs)
	log.Printf("  Proof bytes: %d, public outputs: %d",
		len(proofResp.Proof), len(proofResp.PublicOutputs))

	// -----------------------------------------------------------------------
	// 4. Verify the ZKP proof
	// -----------------------------------------------------------------------
	verifyResp, err := zkpClient.VerifyProof(ctx, proofResp)
	if err != nil {
		log.Fatalf("VerifyProof error: %v", err)
	}
	log.Printf("Verification result: verified=%v circuit=%s time=%dms",
		verifyResp.Verified, verifyResp.CircuitId, verifyResp.VerificationTimeMs)

	// -----------------------------------------------------------------------
	// 5. List available circuits
	// -----------------------------------------------------------------------
	listResp, err := zkpClient.ListCircuits(ctx, &pb.Empty{})
	if err != nil {
		log.Printf("ListCircuits error (may be unimplemented): %v", err)
	} else {
		log.Printf("Available circuits: %s", listResp.CircuitIds)
	}

	// -----------------------------------------------------------------------
	// 6. Simple proof-of-concept: SHA-256 hash of credential
	// -----------------------------------------------------------------------
	hash := sha256.Sum256([]byte(*credentialID))
	log.Printf("Credential hash (SHA-256): %s", hex.EncodeToString(hash[:]))

	fmt.Println("\n=== gRPC client completed successfully ===")
}
