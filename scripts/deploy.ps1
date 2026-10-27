param(
  [string]$Email = ""
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

node scripts/pack-site.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  Write-Host "No está el AWS CLI. Instálenlo, hagan aws configure y vuelvan a correr este script."
  exit 1
}

aws sts get-caller-identity | Out-Host
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Get-Command sam -ErrorAction SilentlyContinue)) {
  Write-Host "Falta SAM CLI. Instálenlo: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
  exit 1
}

Set-Location infra
sam deploy
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$bucket = aws cloudformation describe-stacks --stack-name plaga-z --region us-east-1 --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text
$dist = aws cloudformation describe-stacks --stack-name plaga-z --region us-east-1 --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text
$url = aws cloudformation describe-stacks --stack-name plaga-z --region us-east-1 --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text

Set-Location ..
aws s3 sync dist "s3://$bucket" --delete --region us-east-1
aws cloudfront create-invalidation --distribution-id $dist --paths "/*" | Out-Host

if ($Email -ne "") {
  $account = aws sts get-caller-identity --query Account --output text
  $note = Get-Content infra/budget-notifications.json -Raw
  $note = $note.Replace("ALERT_EMAIL", $Email)
  $tmp = Join-Path $env:TEMP "plaga-budget-notifications.json"
  Set-Content -Path $tmp -Value $note -Encoding ascii
  aws budgets create-budget --account-id $account --budget file://infra/budget.json --notifications-with-subscribers file://$tmp
}

Write-Host "Sitio: $url"
Write-Host "Región: us-east-1"
