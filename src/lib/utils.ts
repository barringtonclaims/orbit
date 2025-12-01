import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Replace template variables with actual values
export function fillTemplate(
  template: string,
  variables: {
    customer_name?: string;
    user_name?: string;
    company_name?: string;
    date?: string;
    time?: string;
    address?: string;
  }
): string {
  let filled = template;
  
  if (variables.customer_name) {
    filled = filled.replace(/{customer_name}/g, variables.customer_name);
  }
  if (variables.user_name) {
    filled = filled.replace(/{user_name}/g, variables.user_name);
  }
  if (variables.company_name) {
    filled = filled.replace(/{company_name}/g, variables.company_name);
  }
  if (variables.date) {
    filled = filled.replace(/{date}/g, variables.date);
  }
  if (variables.time) {
    filled = filled.replace(/{time}/g, variables.time);
  }
  if (variables.address) {
    filled = filled.replace(/{address}/g, variables.address);
  }
  
  return filled;
}
