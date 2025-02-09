import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';

export class ProdAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SECTION 1: NETWORKING SETUP
    // First, we create our VPC (Virtual Private Cloud) - this is our isolated network environment
    const vpc = new ec2.Vpc(this, 'ProdVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      availabilityZones: ['us-east-1a', 'us-east-1b'],
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 1
    });

    // SECTION 2: CONTAINER REGISTRY AND CLUSTER
    // Create ECR repository for storing our Docker images
    const repository = new ecr.Repository(this, 'ProdAppRepo', {
      repositoryName: 'prod-app-repository',
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
    });

    // Create ECS cluster to manage our containers
    const cluster = new ecs.Cluster(this, 'ProdEcsCluster', {
      vpc,
      containerInsights: true,
    });

    // SECTION 3: IAM ROLES
    // Create the task role (permissions for the application running in the container)
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Role for ECS tasks to access AWS services',
    });

    // Add permissions to the task role
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:ProdAppStackProdAppDbSecret-*`,
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    // Create execution role (permissions for ECS to run the container)
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ],
    });

    // SECTION 4: CONTAINER TASK DEFINITION
    // Define how our container should run
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'ProdAppTaskDef', {
      taskRole: taskRole,
      executionRole: executionRole,
      memoryLimitMiB: 512,
      cpu: 256,
    });

    // Configure the container
    const container = taskDefinition.addContainer('ProdAppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository),
      memoryLimitMiB: 512,
      cpu: 256,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'prod-app',
        logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        NODE_ENV: 'production',
      },
    });

    // Add container port mapping
    container.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    // SECTION 5: SECURITY GROUPS
    // Create security group for ECS tasks
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc,
      description: 'Security group for ECS tasks',
      allowAllOutbound: true,
    });

    // Create security group for RDS
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Security group for RDS instance',
      allowAllOutbound: false,
    });

    // Allow ECS tasks to access RDS
    dbSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(3306),
      'Allow ECS tasks to access RDS'
    );

    // SECTION 6: LOAD BALANCER
    // Create ALB security group
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for Application Load Balancer',
    });

    // Create Application Load Balancer
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ProdAppLB', {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    // Add listener
    const listener = loadBalancer.addListener('Listener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.fixedResponse(404),
    });

    // SECTION 7: ECS SERVICE
    // Create Fargate service
    const service = new ecs.FargateService(this, 'ProdAppService', {
      cluster,
      taskDefinition,
      desiredCount: 2,
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      securityGroups: [ecsSecurityGroup],
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Add service as target for load balancer
    listener.addTargets('ECS', {
      port: 80,
      targets: [service],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 5,
        unhealthyThresholdCount: 2,
        healthyHttpCodes: '200',
      },
    });

    // SECTION 8: DATABASE
    // Create RDS instance
    const dbInstance = new rds.DatabaseInstance(this, 'ProdAppDb', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_32
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      securityGroups: [dbSecurityGroup],
      multiAz: true,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      deletionProtection: false,
      databaseName: 'prodappdb',
      credentials: rds.Credentials.fromGeneratedSecret('admin'),
      backupRetention: cdk.Duration.days(7),
      preferredBackupWindow: '03:00-04:00',
    });

    // SECTION 9: MANAGEMENT ACCESS
    // Create security group for EC2 management instance
    const ec2SecurityGroup = new ec2.SecurityGroup(this, 'Ec2SecurityGroup', {
      vpc,
      description: 'Security group for EC2 instance',
      allowAllOutbound: true,
    });

    // Allow SSH access only from your IP
    const allowedIp = '172.56.165.110';
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.ipv4(allowedIp + '/32'),
      ec2.Port.tcp(22),
      'Allow SSH access only from specific IP'
    );

    // Allow EC2 to access RDS
    dbSecurityGroup.addIngressRule(
      ec2SecurityGroup,
      ec2.Port.tcp(3306),
      'Allow EC2 instance to access RDS'
    );

    // Create EC2 instance
    const ec2Instance = new ec2.Instance(this, 'DbAccessor', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      securityGroup: ec2SecurityGroup,
      keyPair: ec2.KeyPair.fromKeyPairName(this, 'ExistingKeyPair', 'awskeypair'),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });

    // SECTION 10: OUTPUTS
    // Output important information
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
      exportName: 'LoadBalancerDNS',
    });

    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: dbInstance.instanceEndpoint.hostname,
      description: 'Database Endpoint',
      exportName: 'DbEndpoint',
    });

    new cdk.CfnOutput(this, 'DbAccessorIP', {
      value: ec2Instance.instancePublicIp,
      description: 'Database accessor EC2 instance public IP',
      exportName: 'DbAccessorIP',
    });
  }
}