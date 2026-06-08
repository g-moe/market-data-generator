# TODO - output shapes

# TODO - hard requirements

# Sierra requirements

- since we use the format `tradester_${symbolId}.scid` for SCID files, sierra does not know what `tradester_${symbolId}` symbol is; we must manually add each symbol to sierra's symbol list `Global Settings >> Symbol Settings >> Find the real symbol >> Duplicate >> Change the name to our format (eg. tradester_ES) ... this gives us the symbol with the correct config (tick size, etc.)`
  - symbols we have added to sierra: `tradester_ES`, `tradester_NQ`
