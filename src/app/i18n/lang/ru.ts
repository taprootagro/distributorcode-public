import type { Translations } from "../../hooks/useLanguage";
import en from "./en";
import { inventoryRu } from "./ledgerInventoryLocales";

const translations: Translations = {
  ...en,
  inventory: inventoryRu,
};

export default translations;
