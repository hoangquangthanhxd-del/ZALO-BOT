$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$taskApp = Join-Path $taskRoot '.cache\coworker-native-app\dist\src\widget-mcp.js'
if (-not (Test-Path -LiteralPath $taskApp -PathType Leaf)) { throw 'REVIEWED_GATEWAY_BUILD_MISSING' }
if (-not ([IO.File]::ReadAllText($taskApp).Contains('ui://coworkerapi/bridge-v21.html'))) { throw 'REVIEWED_GATEWAY_VERSION_MISMATCH' }
if (@(Get-NetTCPConnection -LocalPort 3211 -State Listen -ErrorAction SilentlyContinue).Count) { throw 'GATEWAY_PORT_ALREADY_OWNED' }
$taskLogs = Join-Path $env:LOCALAPPDATA 'PTAP-NEXT\coworker-image-gateway'
New-Item -ItemType Directory -Path $taskLogs -Force | Out-Null
$taskConfiguration = Join-Path $taskLogs 'configuration'
if (-not (Test-Path -LiteralPath (Join-Path $taskConfiguration '.env') -PathType Leaf)) { throw 'RUNTIME_CONFIGURATION_MISSING' }
$taskRun = $null
for ($taskIndex=100; $taskIndex -lt 10000; $taskIndex++) {
  $taskCandidate = Join-Path $taskRoot ('.cache\coworker-native-run-'+$taskIndex)
  if (-not (Test-Path -LiteralPath $taskCandidate)) { $taskRun=$taskCandidate; break }
}
if (-not $taskRun) { throw 'GATEWAY_RUN_SLOTS_EXHAUSTED' }
$taskInfo = [Diagnostics.ProcessStartInfo]::new()
$taskInfo.FileName = (Get-Command node.exe -ErrorAction Stop).Source
$taskInfo.Arguments = '"'+(Join-Path $PSScriptRoot 'launch-owned.mjs')+'" "'+$taskRun+'" runtime "'+$taskConfiguration+'"'
$taskInfo.WorkingDirectory = $taskRoot
$taskInfo.UseShellExecute = $false
$taskInfo.CreateNoWindow = $true
$taskInfo.RedirectStandardOutput = $true
$taskInfo.RedirectStandardError = $true
$taskOut = [IO.FileStream]::new((Join-Path $taskLogs 'stdout.log'), [IO.FileMode]::Append, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite, 1, [IO.FileOptions]::Asynchronous)
$taskErr = [IO.FileStream]::new((Join-Path $taskLogs 'stderr.log'), [IO.FileMode]::Append, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite, 1, [IO.FileOptions]::Asynchronous)
try {
  $taskChild = [Diagnostics.Process]::Start($taskInfo)
  $taskCopyOut = $taskChild.StandardOutput.BaseStream.CopyToAsync($taskOut)
  $taskCopyErr = $taskChild.StandardError.BaseStream.CopyToAsync($taskErr)
  $taskChild.WaitForExit()
  [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($taskCopyOut,$taskCopyErr))
  exit $taskChild.ExitCode
} finally {
  $taskOut.Dispose(); $taskErr.Dispose()
  if ($taskChild) { $taskChild.Dispose() }
}
