; Personal Windows x64 installer with the standard assisted NSIS wizard.
!include "FileFunc.nsh"
!include "WordFunc.nsh"

!macro customWelcomePage
  ; Keep the standard localized wizard controls and page copy, but brand its
  ; welcome and header artwork with resources embedded in the single EXE.
  !define MUI_BGCOLOR "100B0C"
  !define MUI_TEXTCOLOR "FFF6F2"
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_RIGHT
  !define MUI_HEADERIMAGE_BITMAP "${PROJECT_DIR}\build\chronum-installer-header.bmp"
  !ifdef MUI_WELCOMEFINISHPAGE_BITMAP
    !undef MUI_WELCOMEFINISHPAGE_BITMAP
  !endif
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${PROJECT_DIR}\build\chronum-installer-welcome.bmp"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    ; initMultiUser restores the previous InstallLocation during upgrades.
    InstallDir "$LOCALAPPDATA\Programs\Chronum"
    !include "${PROJECT_DIR}\release\personal-payload.nsh"
  !endif
  ; electron-builder selects non-solid zlib before the template adds resources.
!macroend

!macro ChronomancerCheckSize FILE EXPECTED
  ClearErrors
  FileOpen $0 "${FILE}" r
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "Chronum installation is incomplete. Run the installer again."
    SetErrorLevel 2
    Quit
  ${EndIf}
  FileSeek $0 0 END $1
  FileClose $0
  ${If} $1 != ${EXPECTED}
    MessageBox MB_OK|MB_ICONSTOP "Chronum installation is incomplete. Run the installer again."
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro ChronomancerCheckExecutable FILE
  ClearErrors
  FileOpen $0 "${FILE}" r
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "Chronum installation is incomplete. Run the installer again."
    SetErrorLevel 2
    Quit
  ${EndIf}
  FileSeek $0 0 END $1
  FileClose $0
  ; electron-builder modifies the executable after afterPack, so its exact
  ; byte count is not stable. A full packaged Electron binary is well above 100 MB.
  ${If} $1 < 104857600
    MessageBox MB_OK|MB_ICONSTOP "Chronum installation is incomplete. Run the installer again."
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro ChronomancerCheckExecutable "$INSTDIR\Chronum.exe"
  !insertmacro ChronomancerCheckSize "$INSTDIR\resources\app.asar" ${CHRONOMANCER_ASAR_BYTES}
  ; Remove the previous executable after the replacement has passed validation.
  Delete "$INSTDIR\Sindaris.exe"
  Delete "$INSTDIR\Chronomancer.exe"
  ; Bypass the broken old Start Menu launch link. Shortcuts still get refreshed.
  StrCpy $launchLink "$INSTDIR\Chronum.exe"
  ; Clean only the legacy updater's known installer copy, not user data.
  Delete "$LOCALAPPDATA\sindaris-desktop-updater\installer.exe"
  Delete "$LOCALAPPDATA\sindaris-desktop-updater\pending\Chronomancer-Setup-*.exe"
  Delete "$LOCALAPPDATA\sindaris-desktop-updater\pending\Chronum-Setup-*.exe"
  Delete "$LOCALAPPDATA\sindaris-desktop-updater\pending\Sindaris-Setup-*.exe"
  RMDir "$LOCALAPPDATA\sindaris-desktop-updater\pending"
  RMDir "$LOCALAPPDATA\sindaris-desktop-updater"
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
