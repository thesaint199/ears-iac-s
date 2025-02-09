## Overview
This project demonstrates a production-quality CI/CD pipeline for a Dockerized "Hello World" application connected to a database. It showcases modern DevOps practices, including Infrastructure as Code (IaC), a robust CI/CD pipeline, and deployment to AWS using ECS, ECR, and RDS.

## Prerequisites
Before deploying or running the project, ensure you have the following:

### Tools and Services:
- **AWS Account**: Access to AWS services.
- **AWS CLI**: Installed and configured with appropriate credentials.
- **Node.js**: Version 16 or higher.
- **Docker**: Installed and running locally.
- **Git**: Installed locally.
- **AWS CDK**: Installed globally (`npm install -g aws-cdk`).

### IAM Requirements:
- IAM user/role with permissions to:
  - Create and manage ECS, ECR, RDS, and IAM resources.
  - Push Docker images to ECR.
  - Deploy applications to ECS.

## Deployment Steps

### Step 1: Clone the Repository

git clone <REPO_URL>
cd <REPO_NAME>

### Step 2: Install Dependencies
Navigate to the `cdk` directory and install dependencies.

cd cdk
npm install

### Step 3: Deploy Infrastructure
Use AWS CDK to deploy the infrastructure:

cdk deploy

This will:
- Create a VPC, ECS cluster, RDS instance, and other resources.
- Output important information, including the Load Balancer DNS name.

**Outputs:**
- `LoadBalancerDNS`: DNS of the Application Load Balancer.
- `DbEndpoint`: Database connection endpoint.
- `DbAccessorIP`: Public IP of the EC2 instance for database access.

### Step 4: Build and Push Docker Image
1. Authenticate Docker with ECR:

   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ECR_URL>

2. Build and tag the Docker image:

   docker build -t my-app .
   docker tag my-app:latest <ECR_URL>/prod-app-repository:latest

3. Push the image to ECR:

   docker push <ECR_URL>/prod-app-repository:latest


### Step 5: Trigger Deployment
The CI/CD pipeline automatically deploys changes to the ECS cluster when code is pushed to the `main` branch. To manually force a deployment:

aws ecs update-service --cluster <ClusterName> --service <ServiceName> --force-new-deployment

## Application Access
1. Navigate to the Load Balancer DNS in your browser:

   http://<LoadBalancerDNS>

2. You should see:

   Message from DB: Hello World from <Your Message Here>!


## Infrastructure Details
The infrastructure is defined using AWS CDK and includes:

### Networking:
- **VPC**: A production-like VPC with public and private subnets.
- **Security Groups**:
  - ECS tasks can access the RDS database.
  - EC2 instance for database setup allows SSH access.

### ECS:
- **Cluster**: ECS cluster for production workloads.
- **Task Definition**: Defines container specs with memory and CPU limits.
- **Fargate Service**: Runs the Dockerized application with auto-scaling.

### ECR:
- **Repository**: Stores the Docker image for the application.

### RDS:
- **Database**: MySQL database with multi-AZ support, encrypted storage, and automatically generated credentials.

### Load Balancer:
- **ALB**: Exposes the application to the internet and performs health checks.

## CI/CD Pipeline
Implemented using GitHub Actions with the following stages:

1. **Linting**: Ensures code style and quality.
2. **Security Scan**: Placeholder for future integration with a security scanning tool.
3. **Vulnerability Scan**: Placeholder for scanning Docker images.
4. **Build and Test**: Builds the application and runs placeholder tests.
5. **Deploy**: Pushes the Docker image to ECR and deploys to ECS.

To trigger the pipeline, push changes to the `main` branch.

## Improvements
Here are the next steps to enhance this solution:
1. **Automated Testing**: Replace placeholder tests with end-to-end tests.
2. **Security Scanning**: Integrate tools like Snyk or Trivy for scanning.
3. **Monitoring and Alerts**: Add CloudWatch monitoring and SNS alerts.
4. **Secrets Management**: Use AWS Secrets Manager for storing sensitive data.
5. **Documentation**: Extend this README with troubleshooting and FAQs.

Thank you for reviewing this project. Feel free to reach out with any questions!
