; Personal Windows x64 installer: one fixed destination, no bundled payload in C:\Temp.
!include "FileFunc.nsh"
!include "WordFunc.nsh"

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    InstallDir "D:\Games\Sindaris"
    !include "${PROJECT_DIR}\release\personal-payload.nsh"
  !endif
  ; electron-builder selects non-solid zlib before the template adds resources.
!macroend

!macro customInit
  StrCpy $INSTDIR "D:\Games\Sindaris"
  IfFileExists "D:\*.*" +4 0
    MessageBox MB_OK|MB_ICONSTOP "This installer requires drive D:. Chronomancer was not changed."
    SetErrorLevel 2
    Quit
  System::Call 'kernel32::GetDiskFreeSpaceExW(w "D:\", *l .r0, p 0, p 0) i.r1'
  ${If} $1 == 0
    MessageBox MB_OK|MB_ICONSTOP "Cannot check free space on D:. Chronomancer was not changed."
    SetErrorLevel 2
    Quit
  ${EndIf}
  System::Int64Op $0 / 1048576
  Pop $0
  ${If} $0 < 2048
    MessageBox MB_OK|MB_ICONSTOP "At least 2 GB free on D: is required before replacing Chronomancer."
    SetErrorLevel 2
    Quit
  ${EndIf}
  ; Child uninstallers may stage the previous version. Keep that work on D: too.
  CreateDirectory "D:\Games\Sindaris-Install-Temp"
  System::Call 'kernel32::SetEnvironmentVariableW(w "TEMP", w "D:\Games\Sindaris-Install-Temp") i.r0'
  System::Call 'kernel32::SetEnvironmentVariableW(w "TMP", w "D:\Games\Sindaris-Install-Temp") i.r0'
  CreateDirectory "$INSTDIR"
  ClearErrors
  FileOpen $0 "$INSTDIR\.sindaris-write-check" w
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "Cannot write to D:\Games\Sindaris. The previous version was not removed."
    SetErrorLevel 2
    Quit
  ${EndIf}
  FileClose $0
  Delete "$INSTDIR\.sindaris-write-check"
!macroend

!macro ChronomancerCheckSize FILE EXPECTED
  ClearErrors
  FileOpen $0 "${FILE}" r
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "Chronomancer installation is incomplete. Run the installer again."
    SetErrorLevel 2
    Quit
  ${EndIf}
  FileSeek $0 0 END $1
  FileClose $0
  ${If} $1 != ${EXPECTED}
    MessageBox MB_OK|MB_ICONSTOP "Chronomancer installation is incomplete. Run the installer again."
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro ChronomancerCheckExecutable FILE
  ClearErrors
  FileOpen $0 "${FILE}" r
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "Chronomancer installation is incomplete. Run the installer again."
    SetErrorLevel 2
    Quit
  ${EndIf}
  FileSeek $0 0 END $1
  FileClose $0
  ; electron-builder modifies the executable after afterPack, so its exact
  ; byte count is not stable. A full packaged Electron binary is well above 100 MB.
  ${If} $1 < 104857600
    MessageBox MB_OK|MB_ICONSTOP "Chronomancer installation is incomplete. Run the installer again."
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro ChronomancerCheckExecutable "$INSTDIR\Chronomancer.exe"
  !insertmacro ChronomancerCheckSize "$INSTDIR\resources\app.asar" ${CHRONOMANCER_ASAR_BYTES}
  ; Remove the previous executable after the replacement has passed validation.
  Delete "$INSTDIR\Sindaris.exe"
  ; Bypass the broken old Start Menu launch link. Shortcuts still get refreshed.
  StrCpy $launchLink "$INSTDIR\Chronomancer.exe"
  ; Clean only the legacy updater's known installer copy, not user data.
  Delete "$LOCALAPPDATA\sindaris-desktop-updater\installer.exe"
  Delete "$LOCALAPPDATA\sindaris-desktop-updater\pending\Chronomancer-Setup-*.exe"
  Delete "$LOCALAPPDATA\sindaris-desktop-updater\pending\Sindaris-Setup-*.exe"
  RMDir "$LOCALAPPDATA\sindaris-desktop-updater\pending"
  RMDir "$LOCALAPPDATA\sindaris-desktop-updater"
  RMDir "D:\Games\Sindaris-Install-Temp"
  ; Remove older sibling installers only after the new installed files pass validation.
  FindFirst $R6 $R7 "$EXEDIR\Chronomancer-Setup-*.exe"
  ${DoWhile} $R7 != ""
    ${If} "$EXEDIR\$R7" != "$EXEPATH"
      ClearErrors
      ${GetFileVersion} "$EXEDIR\$R7" $R8
      ${IfNot} ${Errors}
        ${VersionCompare} "$R8" "${VERSION}" $R9
        ${If} $R9 == 2
          Delete "$EXEDIR\$R7"
        ${EndIf}
      ${EndIf}
    ${EndIf}
    FindNext $R6 $R7
  ${Loop}
  FindClose $R6
  ; Clean installers made by the previous brand after the replacement is verified.
  FindFirst $R6 $R7 "$EXEDIR\Sindaris-Setup-*.exe"
  ${DoWhile} $R7 != ""
    ClearErrors
    ${GetFileVersion} "$EXEDIR\$R7" $R8
    ${IfNot} ${Errors}
      ${VersionCompare} "$R8" "${VERSION}" $R9
      ${If} $R9 == 2
        Delete "$EXEDIR\$R7"
      ${EndIf}
    ${EndIf}
    FindNext $R6 $R7
  ${Loop}
  FindClose $R6
!macroend
