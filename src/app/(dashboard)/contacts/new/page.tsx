"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { createContact } from "@/lib/actions/contacts";
import { ArrowLeft, Loader2, User, Mail, Phone, MapPin, FileText, Upload, Contact } from "lucide-react";

// Type for the Contact Picker API
interface ContactPickerContact {
  name?: string[];
  email?: string[];
  tel?: string[];
  address?: Array<{
    addressLine?: string[];
    city?: string;
    region?: string;
    postalCode?: string;
  }>;
}

// Extend Navigator for Contact Picker API
declare global {
  interface Navigator {
    contacts?: {
      select: (
        properties: string[],
        options?: { multiple?: boolean }
      ) => Promise<ContactPickerContact[]>;
      getProperties: () => Promise<string[]>;
    };
  }
}

// Parse vCard file content
function parseVCard(vcardText: string): Partial<typeof initialFormData> {
  const lines = vcardText.split(/\r\n|\r|\n/);
  const result: Partial<typeof initialFormData> = {};
  
  for (const line of lines) {
    // Handle FN (Full Name)
    if (line.startsWith('FN:') || line.startsWith('FN;')) {
      const fullName = line.split(':').slice(1).join(':').trim();
      const parts = fullName.split(' ');
      result.firstName = parts[0] || '';
      result.lastName = parts.slice(1).join(' ') || '';
    }
    // Handle N (Name) - format: Last;First;Middle;Prefix;Suffix
    else if (line.startsWith('N:') || line.startsWith('N;')) {
      const nameValue = line.split(':').slice(1).join(':');
      const parts = nameValue.split(';');
      if (parts[1]) result.firstName = parts[1].trim();
      if (parts[0]) result.lastName = parts[0].trim();
    }
    // Handle EMAIL
    else if (line.startsWith('EMAIL')) {
      const email = line.split(':').slice(1).join(':').trim();
      if (email) result.email = email;
    }
    // Handle TEL (Phone)
    else if (line.startsWith('TEL')) {
      const phone = line.split(':').slice(1).join(':').trim();
      if (phone) result.phone = phone;
    }
    // Handle ADR (Address) - format: PO;Ext;Street;City;Region;PostalCode;Country
    else if (line.startsWith('ADR')) {
      const addrValue = line.split(':').slice(1).join(':');
      const parts = addrValue.split(';');
      if (parts[2]) result.address = parts[2].trim();
      if (parts[3]) result.city = parts[3].trim();
      if (parts[4]) result.state = parts[4].trim();
      if (parts[5]) result.zipCode = parts[5].trim();
    }
    // Handle NOTE
    else if (line.startsWith('NOTE')) {
      const note = line.split(':').slice(1).join(':').trim();
      if (note) result.notes = note;
    }
  }
  
  return result;
}

const initialFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  source: "",
  notes: "",
};

export default function NewContactPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [formData, setFormData] = useState(initialFormData);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  // Check if Contact Picker API is available
  const hasContactPicker = typeof navigator !== 'undefined' && 'contacts' in navigator;

  // Handle Contact Picker API (mobile)
  const handlePickContact = async () => {
    if (!navigator.contacts) {
      toast.error("Contact picker not supported on this device");
      return;
    }

    setIsImporting(true);
    try {
      const properties = await navigator.contacts.getProperties();
      const contacts = await navigator.contacts.select(
        properties.filter(p => ['name', 'email', 'tel', 'address'].includes(p)),
        { multiple: false }
      );

      if (contacts && contacts.length > 0) {
        const contact = contacts[0];
        
        // Parse name
        let firstName = "";
        let lastName = "";
        if (contact.name && contact.name[0]) {
          const parts = contact.name[0].split(' ');
          firstName = parts[0] || "";
          lastName = parts.slice(1).join(' ') || "";
        }

        // Parse address
        let address = "";
        let city = "";
        let state = "";
        let zipCode = "";
        if (contact.address && contact.address[0]) {
          const addr = contact.address[0];
          address = addr.addressLine?.join(' ') || "";
          city = addr.city || "";
          state = addr.region || "";
          zipCode = addr.postalCode || "";
        }

        setFormData(prev => ({
          ...prev,
          firstName,
          lastName,
          email: contact.email?.[0] || prev.email,
          phone: contact.tel?.[0] || prev.phone,
          address: address || prev.address,
          city: city || prev.city,
          state: state || prev.state,
          zipCode: zipCode || prev.zipCode,
        }));

        toast.success("Contact imported successfully");
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        toast.error("Failed to import contact");
        console.error('Contact picker error:', error);
      }
    } finally {
      setIsImporting(false);
    }
  };

  // Handle vCard file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const parsed = parseVCard(text);
      
      setFormData(prev => ({
        ...prev,
        ...parsed,
      }));

      toast.success("Contact imported from file");
    } catch (error) {
      toast.error("Failed to read contact file");
      console.error('File read error:', error);
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast.error("First and last name are required");
      return;
    }

    setIsLoading(true);

    try {
      const result = await createContact({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        state: formData.state.trim() || undefined,
        zipCode: formData.zipCode.trim() || undefined,
        source: formData.source.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Contact created! First follow-up task scheduled.");
      
      if (result.action) {
        router.push(`/contacts/${result.data?.id}?action=${result.action}`);
      } else {
        router.push(`/contacts/${result.data?.id}`);
      }
    } catch {
      toast.error("Failed to create contact");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/contacts">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Add Contact</h1>
            <p className="text-muted-foreground">
              Create a new lead or customer
            </p>
          </div>
        </div>

        {/* Import Buttons */}
        <div className="flex gap-2">
          {hasContactPicker && (
            <Button
              type="button"
              variant="outline"
              onClick={handlePickContact}
              disabled={isImporting || isLoading}
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Contact className="w-4 h-4 mr-2" />
              )}
              Import from Device
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || isLoading}
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Upload vCard
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".vcf,.vcard,text/vcard,text/x-vcard"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Basic Information
              </CardTitle>
              <CardDescription>
                Contact name and details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    placeholder="John"
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    placeholder="Doe"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="john@example.com"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Phone
                </Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="source">Lead Source</Label>
                <Input
                  id="source"
                  name="source"
                  value={formData.source}
                  onChange={handleChange}
                  placeholder="e.g., Referral, Website, Cold Call"
                  disabled={isLoading}
                />
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Address
              </CardTitle>
              <CardDescription>
                Property or mailing address
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="123 Main Street"
                  disabled={isLoading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="Springfield"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    placeholder="TX"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zipCode">ZIP Code</Label>
                <Input
                  id="zipCode"
                  name="zipCode"
                  value={formData.zipCode}
                  onChange={handleChange}
                  placeholder="12345"
                  disabled={isLoading}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Notes
              </CardTitle>
              <CardDescription>
                Initial notes about this contact (e.g., situation, referral info)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="e.g., Customer had a leak in their kitchen. Referred by neighbor on Oak Street..."
                rows={4}
                disabled={isLoading}
              />
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        <Card className="mt-6 bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <p className="text-sm">
              <strong>What happens next:</strong> After creating this contact, a &quot;Send First Message&quot; 
              task will automatically be created for <strong>Today</strong>, and you&apos;ll be prompted to send it.
            </p>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <Link href="/contacts">
            <Button type="button" variant="outline" disabled={isLoading}>
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Contact"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
