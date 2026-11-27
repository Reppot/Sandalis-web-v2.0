; Personal Windows x64 installer with the standard assisted NSIS wizard.
!include "FileFunc.nsh"
!include "WordFunc.nsh"

!macro customWelcomePage
  ; Keep MUI's native controls readable and consistent with the light body on
  ; the install-mode and directory pages. The branded artwork stays dark.
  !define MUI_BGCOLOR "F2EEEE"
  !define MUI_TEXTCOLOR "211A1C"
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_RIGHT
  !define MUI_HEADERIMAGE_BITMAP "${PROJECT_DIR}\build\chronum-installer-header.bmp"
  !define MUI_WELCOMEPAGE_TEXT "$(ChronumWelcomeText)"
  !ifdef MUI_WELCOMEFINISHPAGE_BITMAP
    !undef MUI_WELCOMEFINISHPAGE_BITMAP
  !endif
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${PROJECT_DIR}\build\chronum-installer-welcome.bmp"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customHeader
  ; NSIS warning 6030 is expected here: these strings deliberately replace
  ; electron-builder's default translations for the same IDs.
  !pragma warning disable 6030
  ; Replace ambiguous upstream messages with explicit scope and upgrade state.
  ; NSIS permits later LangString definitions to override builder defaults.
  LangString ChronumWelcomeText 1029 "Nainstalujte Chronum a skenujte uložené soubory Foxhole na tomto počítači."
  LangString ChronumWelcomeText 1031 "Installieren Sie Chronum, um Foxhole-Spielstände auf diesem PC zu scannen."
  LangString ChronumWelcomeText 1033 "Install Chronum to scan Foxhole save files on this PC."
  LangString ChronumWelcomeText 3082 "Instala Chronum para analizar archivos de guardado de Foxhole en este PC."
  LangString ChronumWelcomeText 1036 "Installez Chronum pour analyser les sauvegardes de Foxhole sur ce PC."
  LangString ChronumWelcomeText 1045 "Zainstaluj Chronum, aby skanować pliki zapisów Foxhole na tym komputerze."
  LangString ChronumWelcomeText 1046 "Instale o Chronum para verificar arquivos salvos do Foxhole neste PC."
  LangString ChronumWelcomeText 1049 "Установите Chronum, чтобы сканировать сохранения Foxhole на этом компьютере."
  LangString ChronumWelcomeText 1058 "Установіть Chronum, щоб сканувати збереження Foxhole на цьому комп’ютері."
  LangString ChronumWelcomeText 2052 "安装 Chronum，以扫描此电脑上的 Foxhole 存档文件。"

  LangString perUserInstallExists 1029 "Chronum je nainstalován pro tento účet Windows na adrese:"
  LangString perUserInstallExists 1031 "Chronum ist für dieses Windows-Konto installiert unter:"
  LangString perUserInstallExists 1033 "Chronum is installed for this Windows account at:"
  LangString perUserInstallExists 3082 "Chronum está instalado para esta cuenta de Windows en:"
  LangString perUserInstallExists 1036 "Chronum est installé pour ce compte Windows dans :"
  LangString perUserInstallExists 1045 "Chronum jest zainstalowany dla tego konta Windows w lokalizacji:"
  LangString perUserInstallExists 1046 "O Chronum está instalado para esta conta do Windows em:"
  LangString perUserInstallExists 1049 "Chronum уже установлен для этой учётной записи Windows:"
  LangString perUserInstallExists 1058 "Chronum уже встановлено для цього облікового запису Windows:"
  LangString perUserInstallExists 2052 "Chronum 已为此 Windows 帐户安装，位置："

  LangString perMachineInstallExists 1029 "Chronum je nainstalován pro všechny uživatele tohoto počítače na adrese:"
  LangString perMachineInstallExists 1031 "Chronum ist für alle Benutzer dieses PCs installiert unter:"
  LangString perMachineInstallExists 1033 "Chronum is installed for all users of this PC at:"
  LangString perMachineInstallExists 3082 "Chronum está instalado para todos los usuarios de este PC en:"
  LangString perMachineInstallExists 1036 "Chronum est installé pour tous les utilisateurs de ce PC dans :"
  LangString perMachineInstallExists 1045 "Chronum jest zainstalowany dla wszystkich użytkowników tego komputera w lokalizacji:"
  LangString perMachineInstallExists 1046 "O Chronum está instalado para todos os usuários deste PC em:"
  LangString perMachineInstallExists 1049 "Chronum уже установлен для всех пользователей этого компьютера:"
  LangString perMachineInstallExists 1058 "Chronum уже встановлено для всіх користувачів цього комп’ютера:"
  LangString perMachineInstallExists 2052 "Chronum 已为此电脑的所有用户安装，位置："

  LangString reinstallUpgrade 1029 "Tato instalace aktualizuje stávající program."
  LangString reinstallUpgrade 1031 "Dieses Setup aktualisiert die vorhandene Installation."
  LangString reinstallUpgrade 1033 "This setup will update the existing installation."
  LangString reinstallUpgrade 3082 "Este instalador actualizará la instalación existente."
  LangString reinstallUpgrade 1036 "Ce programme mettra à jour l’installation existante."
  LangString reinstallUpgrade 1045 "Ten instalator zaktualizuje istniejącą instalację."
  LangString reinstallUpgrade 1046 "Este instalador atualizará a instalação existente."
  LangString reinstallUpgrade 1049 "Установщик обновит уже установленную программу."
  LangString reinstallUpgrade 1058 "Цей інсталятор оновить наявну програму."
  LangString reinstallUpgrade 2052 "此安装程序将更新现有版本。"
  !pragma warning enable 6030

  !ifndef BUILD_UNINSTALLER
    ; initMultiUser restores the previous InstallLocation during upgrades.
    InstallDir "$LOCALAPPDATA\Programs\Chronum"
    !include "${PROJECT_DIR}\release\personal-payload.nsh"
  !endif
  ; electron-builder selects non-solid zlib before the template adds resources.
!macroend

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif

  !define MUI_PAGE_CUSTOMFUNCTION_SHOW chronumFinishPageShow
  Function chronumFinishPageShow
    ; One clear action on completion; keep the existing launch checkbox.
    ShowWindow $mui.Button.Back ${SW_HIDE}
    ShowWindow $mui.Button.Cancel ${SW_HIDE}
  FunctionEnd
  !insertmacro MUI_PAGE_FINISH
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
  ; Seed one base installer for electron-updater's block-level NSIS downloads.
  ; Replace the previous copy only after the new installer was copied successfully.
  StrCpy $R5 "$LOCALAPPDATA\chronomancer-desktop-updater"
  CreateDirectory "$R5"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "--updated" $R1
  ${If} ${Errors}
    ; A manually launched setup may not match a block map left by an older update.
    Delete "$R5\current.blockmap"
  ${EndIf}
  Delete "$R5\installer.next.exe"
  ClearErrors
  CopyFiles /SILENT "$EXEPATH" "$R5\installer.next.exe"
  ${IfNot} ${Errors}
    Delete "$R5\installer.exe"
    ClearErrors
    Rename "$R5\installer.next.exe" "$R5\installer.exe"
  ${EndIf}
  ${If} ${Errors}
    Delete "$R5\installer.next.exe"
  ${EndIf}
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

!macro customUnInstall
  ; electron-builder uses KEEP_APP_DATA for in-place upgrades. Preserve the
  ; single updater base and pending download during that internal uninstall.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/KEEP_APP_DATA" $R1
  ${If} ${Errors}
    RMDir /r "$LOCALAPPDATA\chronomancer-desktop-updater"
    RMDir /r "$LOCALAPPDATA\sindaris-desktop-updater"
  ${EndIf}
!macroend
