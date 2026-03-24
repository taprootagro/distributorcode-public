import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryId } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryId,
};

export default translations;
