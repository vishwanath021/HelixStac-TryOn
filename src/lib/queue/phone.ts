/** Indian mobile numbers: 10 digits starting 6-9, stored as 91XXXXXXXXXX. */
export function indianMobile(input: string) {
  const digits = input.replace(/[^\d]/g, "");
  let local = "";
  if (digits.length === 10) local = digits;
  else if (digits.length === 12 && digits.startsWith("91")) local = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) local = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(local)) return "";
  return `91${local}`;
}
