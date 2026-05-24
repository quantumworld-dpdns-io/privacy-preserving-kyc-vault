import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as kubernetes from "@pulumi/kubernetes";

// Read configuration
const config = new pulumi.Config();
const environment = config.get("environment") || "dev";
const vpcCidr = config.get("vpcCidr") || "10.0.0.0/16";

// Create VPC
const vpc = new aws.ec2.Vpc(`${environment}-vpc`, {
    cidrBlock: vpcCidr,
    tags: {
        Environment: environment,
        Name: `${environment}-vpc`
    }
});

// Create Internet Gateway
const igw = new aws.ec2.InternetGateway(`${environment}-igw`, {
    vpcId: vpc.id,
    tags: {
        Environment: environment,
        Name: `${environment}-igw`
    }
});

// Create Public Subnets
const publicSubnets = new aws.ec2.Subnet(`${environment}-public-subnet`, {
    vpcId: vpc.id,
    cidrBlock: pulumi.output([
        `${vpcCidr.split("/")[0]}.1.0/24`,
        `${vpcCidr.split("/")[0]}.2.0/24`
    ]).apply((cidrs: string[]) => cidrs[0]), // Simplified for example
    availabilityZone: "us-east-1a",
    mapPublicIpOnLaunch: true,
    tags: {
        Environment: environment,
        Name: `${environment}-public-subnet`
    }
});

// Create Private Subnets
const privateSubnets = new aws.ec2.Subnet(`${environment}-private-subnet`, {
    vpcId: vpc.id,
    cidrBlock: pulumi.output([
        `${vpcCidr.split("/")[0]}.101.0/24`,
        `${vpcCidr.split("/")[0]}.102.0/24`
    ]).apply((cidrs: string[]) => cidrs[0]), // Simplified for example
    availabilityZone: "us-east-1a",
    mapPublicIpOnLaunch: false,
    tags: {
        Environment: environment,
        Name: `${environment}-private-subnet`
    }
});

// Create EKS Cluster
const cluster = new eks.Cluster(`${environment}-eks-cluster`, {
    vpcId: vpc.id,
    publicSubnetIds: [publicSubnets.id],
    privateSubnetIds: [privateSubnets.id],
    instanceType: "t3.medium",
    desiredCapacity: 2,
    minSize: 1,
    maxSize: 3,
    tags: {
        Environment: environment,
        Name: `${environment}-eks-cluster`
    }
});

// Export the cluster's kubeconfig.
export const kubeconfig = cluster.kubeconfig;

// Create a Kubernetes provider that uses the cluster from above.
const k8sProvider = new kubernetes.Provider(`${environment}-k8s`, {
    kubeconfig: cluster.kubeconfig
});

// Example: Deploy a simple NGINX ingress controller
const nginxIngress = new kubernetes.helm.v3.Chart(`${environment}-nginx-ingress`, {
    chart: "nginx-ingress",
    version: "4.0.13",
    fetchOpts: {
        repo: "https://kubernetes.github.io/ingress-nginx"
    },
    namespace: "ingress-nginx",
    values: {
        controller: {
            service: {
                type: "LoadBalancer"
            }
        }
    }
}, { provider: k8sProvider });

// Export the cluster name
export const clusterName = cluster.cluster.name;
export const vpcId = vpc.id;
export const publicSubnetIds = [publicSubnets.id];
export const privateSubnetIds = [privateSubnets.id];
