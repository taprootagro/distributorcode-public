import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryFa } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryFa,
};

export default translations;
