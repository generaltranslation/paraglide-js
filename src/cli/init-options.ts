export type InitOptions = {
  yes?: boolean;
  nonInteractive?: boolean;
  allowDirty?: boolean;
  project?: string;
  outdir?: string;
  lint?: "none" | "eslint" | "oxlint";
  check?: boolean;
  sherlock?: boolean;
  /** `true` adds the machine-translate script, `"gt"` also chooses General Translation. */
  machineTranslation?: boolean | "gt";
};
