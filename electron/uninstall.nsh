; LONE-16: Graceful uninstall — remove user data on uninstall if opted in
; Called by electron-builder NSIS after the default uninstall completes.

!macro customUnInstall
  ; Ask user whether to delete personal data
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to remove your openEXPERT data (database, uploads, and configuration)?$\r$\nChoose No to keep your data." \
    IDNO skip_data_removal

  ; Remove .env (API key + configuration)
  Delete "$INSTDIR\.env"

  ; Remove SQLite database directory
  RMDir /r "$INSTDIR\data"

  ; Remove uploaded documents
  RMDir /r "$INSTDIR\uploads"

  ; Remove generated export files
  RMDir /r "$INSTDIR\outputs"

  skip_data_removal:
!macroend
