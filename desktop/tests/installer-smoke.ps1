$ErrorActionPreference = 'Stop'
$projectDesktop = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = 'D:\Games\Sindaris'
$testRoot = 'D:\Games\Sindaris-Installer-Smoke'
if (Test-Path -LiteralPath $destination) { throw 'Expected a clean hosted runner; refusing to alter an existing installation' }
if (Test-Path -LiteralPath $testRoot) { throw 'Expected a clean hosted runner test directory' }
New-Item -ItemType Directory -Path $testRoot | Out-Null
$originalSetup = @(Get-ChildItem -LiteralPath (Join-Path $projectDesktop 'release') -Filter 'Sindaris-Setup-*.exe')
if ($originalSetup.Count -ne 1) { throw 'Expected one installer' }
$setup = Join-Path $testRoot $originalSetup[0].Name
Copy-Item -LiteralPath $originalSetup[0].FullName -Destination $setup
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
foreach ($fixtureVersion in @('0.1.0', '99.0.0')) {
  $fixtureSource = Join-Path $testRoot ('fixture-' + $fixtureVersion + '.cs')
  $fixtureExe = Join-Path $testRoot ('Sindaris-Setup-' + $fixtureVersion + '.exe')
  $source = 'using System.Reflection; [assembly:AssemblyFileVersion("' + $fixtureVersion + '.0")] class InstallerFixture { static void Main() {} }'
  Set-Content -LiteralPath $fixtureSource -Value $source
  & $csc /nologo /target:winexe ('/out:' + $fixtureExe) $fixtureSource
  if ($LASTEXITCODE -ne 0) { throw 'Could not compile installer fixture' }
}
$unrelated = Join-Path $testRoot 'keep-user-file.txt'
Set-Content -LiteralPath $unrelated -Value 'keep'
$profile = Join-Path $env:APPDATA 'Sindaris'
New-Item -ItemType Directory -Path $profile -Force | Out-Null
$sentinel = Join-Path $profile 'installer-smoke-sentinel.txt'
Set-Content -LiteralPath $sentinel -Value 'preserve-user-settings'
function Install-Personal {
  $process = Start-Process -FilePath $setup -ArgumentList @('/S', '/D=C:\Sindaris-Smoke-Unexpected') -WindowStyle Hidden -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  while (-not $process.HasExited) {
    foreach ($tempDir in Get-ChildItem -LiteralPath $env:TEMP -Directory -Filter 'ns*.tmp' -ErrorAction SilentlyContinue) {
      if ((Test-Path -LiteralPath (Join-Path $tempDir.FullName 'app-64.7z')) -or (Test-Path -LiteralPath (Join-Path $tempDir.FullName '7z-out')) -or (Test-Path -LiteralPath (Join-Path $tempDir.FullName 'old-install'))) {
        throw 'Large application payload was staged in the system temporary folder'
      }
    }
    if ([DateTime]::UtcNow -gt $deadline) { $process.Kill(); throw 'Installer timed out' }
    Start-Sleep -Milliseconds 250
    $process.Refresh()
  }
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw ('Installer failed: ' + $process.ExitCode) }
  foreach ($relative in @('Sindaris.exe', 'resources\app.asar')) {
    $installed = Join-Path $destination $relative
    $packaged = Join-Path $projectDesktop ('release\win-unpacked\' + $relative)
    if ((Get-FileHash -LiteralPath $installed).Hash -ne (Get-FileHash -LiteralPath $packaged).Hash) { throw ('Incomplete installed file: ' + $relative) }
  }
  if ((Get-Content -LiteralPath $sentinel -Raw).Trim() -ne 'preserve-user-settings') { throw 'User settings were removed' }
  if (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'sindaris-desktop-updater\installer.exe')) { throw 'Installer was cached on C:' }
  if ((Test-Path -LiteralPath 'C:\Sindaris-Smoke-Unexpected\Sindaris.exe') -or (Test-Path -LiteralPath 'C:\Sindaris-Smoke-Unexpected\resources\app.asar')) { throw 'Fixed destination was overridden' }
}
Install-Personal
if (Test-Path -LiteralPath (Join-Path $testRoot 'Sindaris-Setup-0.1.0.exe')) { throw 'Old installer was retained' }
if (-not (Test-Path -LiteralPath (Join-Path $testRoot 'Sindaris-Setup-99.0.0.exe'))) { throw 'A newer installer was deleted' }
$obsolete = Join-Path $destination 'obsolete-old-version.txt'
Set-Content -LiteralPath $obsolete -Value 'old binary fixture'
Install-Personal
if (Test-Path -LiteralPath $obsolete) { throw 'Old installation files survived replacement' }
if (-not (Test-Path -LiteralPath $setup)) { throw 'Current installer was deleted' }
if (-not (Test-Path -LiteralPath $unrelated)) { throw 'Unrelated user file was deleted' }
Write-Output 'PERSONAL_INSTALLER_SMOKE_OK: fixed D: folder, two installs, exact file hashes, obsolete installer cleanup, preserved user data, no C: payload cache'
