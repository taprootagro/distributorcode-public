import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryVi } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryVi,
};

export default translations;
