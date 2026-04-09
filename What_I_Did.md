## Install eksctl
```bash
thomas@TDZ-LAPTOP:~/atif/eksctl$ # for ARM systems, set ARCH to: `arm64`, `armv6` or `armv7`
ARCH=amd64
PLATFORM=$(uname -s)_$ARCH

curl -sLO "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_$PLATFORM.tar.gz"

# (Optional) Verify checksum
curl -sL "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_checksums.txt" | grep $PLATFORM | sha256sum --check

tar -xzf eksctl_$PLATFORM.tar.gz -C /tmp && rm eksctl_$PLATFORM.tar.gz

sudo install -m 0755 /tmp/eksctl /usr/local/bin && rm /tmp/eksctl
eksctl_Linux_amd64.tar.gz: OK
[sudo] password for thomas:
thomas@TDZ-LAPTOP:~/atif/eksctl$
```

## Create EKS Cluster
```bash
thomas@TDZ-LAPTOP:~/atif/eksctl$ touch cluster.yaml
thomas@TDZ-LAPTOP:~/atif/eksctl$ nano cluster.yaml
thomas@TDZ-LAPTOP:~/atif/eksctl$ eksctl create cluster -f cluster.yaml
```

```yaml
# cluster.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: atif-cluster
  region: us-west-2

autoModeConfig:
  enabled: true
```

```
2026-04-08 19:32:01 [ℹ]  eksctl version 0.225.0
2026-04-08 19:32:01 [ℹ]  using region us-west-2
2026-04-08 19:32:01 [ℹ]  setting availability zones to [us-west-2b us-west-2d us-west-2c]
2026-04-08 19:32:01 [ℹ]  subnets for us-west-2b - public:192.168.0.0/19 private:192.168.96.0/19
2026-04-08 19:32:01 [ℹ]  subnets for us-west-2d - public:192.168.32.0/19 private:192.168.128.0/19
2026-04-08 19:32:01 [ℹ]  subnets for us-west-2c - public:192.168.64.0/19 private:192.168.160.0/19
2026-04-08 19:32:01 [ℹ]  using Kubernetes version 1.34
2026-04-08 19:32:01 [ℹ]  creating EKS cluster "atif-cluster" in "us-west-2" region with
2026-04-08 19:32:01 [ℹ]  if you encounter any issues, check CloudFormation console or try 'eksctl utils describe-stacks --region=us-west-2 --cluster=atif-cluster'
2026-04-08 19:32:01 [ℹ]  Kubernetes API endpoint access will use default of {publicAccess=true, privateAccess=false} for cluster "atif-cluster" in "us-west-2"
2026-04-08 19:32:01 [ℹ]  CloudWatch logging will not be enabled for cluster "atif-cluster" in "us-west-2"
2026-04-08 19:32:01 [ℹ]  you can enable it with 'eksctl utils update-cluster-logging --enable-types={SPECIFY-YOUR-LOG-TYPES-HERE (e.g. all)} --region=us-west-2 --cluster=atif-cluster'
2026-04-08 19:32:01 [ℹ]  default addons metrics-server were not specified, will install them as EKS addons
2026-04-08 19:32:01 [ℹ]
2 sequential tasks: { create cluster control plane "atif-cluster",
    2 sequential sub-tasks: {
        no tasks,
        wait for control plane to become ready,
    }
}
2026-04-08 19:32:01 [ℹ]  building cluster stack "eksctl-atif-cluster-cluster"
2026-04-08 19:32:01 [ℹ]  deploying stack "eksctl-atif-cluster-cluster"
2026-04-08 19:32:31 [ℹ]  waiting for CloudFormation stack "eksctl-atif-cluster-cluster"
2026-04-08 19:33:02 [ℹ]  waiting for CloudFormation stack "eksctl-atif-cluster-cluster"
2026-04-08 19:34:02 [ℹ]  waiting for CloudFormation stack "eksctl-atif-cluster-cluster"
2026-04-08 19:35:02 [ℹ]  waiting for CloudFormation stack "eksctl-atif-cluster-cluster"
2026-04-08 19:36:02 [ℹ]  waiting for CloudFormation stack "eksctl-atif-cluster-cluster"
2026-04-08 19:37:02 [ℹ]  waiting for CloudFormation stack "eksctl-atif-cluster-cluster"
2026-04-08 19:38:03 [ℹ]  waiting for CloudFormation stack "eksctl-atif-cluster-cluster"
2026-04-08 19:39:03 [ℹ]  waiting for CloudFormation stack "eksctl-atif-cluster-cluster"
2026-04-08 19:40:03 [ℹ]  waiting for CloudFormation stack "eksctl-atif-cluster-cluster"
2026-04-08 19:41:03 [ℹ]  waiting for CloudFormation stack "eksctl-atif-cluster-cluster"
2026-04-08 19:42:03 [ℹ]  waiting for CloudFormation stack "eksctl-atif-cluster-cluster"
2026-04-08 19:44:05 [ℹ]  waiting for the control plane to become ready
2026-04-08 19:44:06 [✔]  saved kubeconfig as "/home/thomas/.kube/config"
2026-04-08 19:44:06 [ℹ]  no tasks
2026-04-08 19:44:06 [✔]  all EKS cluster resources for "atif-cluster" have been created
2026-04-08 19:44:07 [ℹ]  creating addon: metrics-server
2026-04-08 19:44:07 [ℹ]  successfully created addon: metrics-server
2026-04-08 19:44:09 [ℹ]  kubectl command should work with "/home/thomas/.kube/config", try 'kubectl get nodes'
2026-04-08 19:44:09 [✔]  EKS cluster "atif-cluster" in "us-west-2" region is ready
```

### It works!
```bash
thomas@TDZ-LAPTOP:~/atif/eksctl$ kubectl get nodes
```
```
NAME                  STATUS   ROLES    AGE   VERSION
i-0980903f084f98a6b   Ready    <none>   94s   v1.34.4-eks-f69f56f
```

## Build Docker Images
```bash
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/web_dataentry$ sudo docker build -t web_dataentry:latest .
[+] Building 9.1s (10/10) FINISHED
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/web_analytics$ sudo docker build -t web_analytics:latest .
[+] Building 8.2s (10/10) FINISHED
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/svc_authentication$ sudo docker build -t svc_authentication:latest .
[+] Building 20.5s (10/10) FINISHED
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/svc_analytics$ sudo docker build -t svc_analytics:latest .
[+] Building 9.6s (10/10) FINISHED
```

## Tag and Push Docker Images to Docker Hub
```bash
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/.k8s$ sudo docker image tag web_dataentry:latest tredecate/web_dataentry:latest
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/.k8s$ sudo docker image tag web_analytics:latest tredecate/web_analytics:latest
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/.k8s$ sudo docker image tag svc_authentication:latest tredecate/svc_authentication:latest
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/.k8s$ sudo docker image tag svc_analytics:latest tredecate/svc_analytics:latest
```

```bash
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/.k8s$ sudo docker image push tredecate/web_dataentry:latest
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/.k8s$ sudo docker image push tredecate/web_analytics:latest
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/.k8s$ sudo docker image push tredecate/svc_authentication:latest
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/.k8s$ sudo docker image push tredecate/svc_analytics:latest
```

## Apply Kubernetes Manifests
```bash
thomas@TDZ-LAPTOP:~/atif/max/max-acit3495-p1-g20/.k8s$ kubectl apply -f . -n maxtest
```
