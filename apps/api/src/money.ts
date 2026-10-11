import { z } from "zod";

export const moneyAmountSchema = z.string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with up to 10 digits and 2 decimal places.");
