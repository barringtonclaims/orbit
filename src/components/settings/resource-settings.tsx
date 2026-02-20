"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  createResourceCompany,
  updateResourceCompany,
  deleteResourceCompany,
  createResourceContact,
  updateResourceContact,
  deleteResourceContact,
} from "@/lib/actions/resources";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  Building2,
  UserPlus,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Contact,
} from "lucide-react";

interface ResourceContactData {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

interface ResourceCompanyData {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  contacts: ResourceContactData[];
}

const COMPANY_TYPES = [
  "Supplier",
  "Subcontractor",
  "Appraiser",
  "Adjuster Firm",
  "Insurance Carrier",
  "Other",
];

interface ResourceSettingsProps {
  initialCompanies: ResourceCompanyData[];
}

export function ResourceSettings({ initialCompanies }: ResourceSettingsProps) {
  const router = useRouter();
  const [companies, setCompanies] = useState(initialCompanies);

  // Company dialog state
  const [showCompanyDialog, setShowCompanyDialog] = useState(false);
  const [editingCompany, setEditingCompany] = useState<ResourceCompanyData | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<ResourceCompanyData | null>(null);
  const [companyForm, setCompanyForm] = useState({
    name: "",
    type: "Supplier",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  // Contact dialog state
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<ResourceContactData | null>(null);
  const [deletingContact, setDeletingContact] = useState<{ contact: ResourceContactData; companyId: string } | null>(null);
  const [contactCompanyId, setContactCompanyId] = useState<string>("");
  const [contactForm, setContactForm] = useState({
    name: "",
    role: "",
    phone: "",
    email: "",
    notes: "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [openCompanies, setOpenCompanies] = useState<Set<string>>(new Set());

  function toggleCompany(id: string) {
    setOpenCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Company CRUD ──

  function openCreateCompany() {
    setCompanyForm({ name: "", type: "Supplier", phone: "", email: "", address: "", notes: "" });
    setEditingCompany(null);
    setShowCompanyDialog(true);
  }

  function openEditCompany(c: ResourceCompanyData) {
    setCompanyForm({
      name: c.name,
      type: c.type,
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      notes: c.notes || "",
    });
    setEditingCompany(c);
    setShowCompanyDialog(true);
  }

  async function handleSaveCompany() {
    if (!companyForm.name.trim()) {
      toast.error("Company name is required");
      return;
    }
    setIsSaving(true);
    try {
      if (editingCompany) {
        const result = await updateResourceCompany(editingCompany.id, companyForm);
        if (result.error) { toast.error(result.error); return; }
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === editingCompany.id
              ? { ...c, ...companyForm, phone: companyForm.phone || null, email: companyForm.email || null, address: companyForm.address || null, notes: companyForm.notes || null }
              : c
          )
        );
        toast.success("Company updated");
      } else {
        const result = await createResourceCompany(companyForm);
        if (result.error) { toast.error(result.error); return; }
        if (result.data) {
          setCompanies((prev) => [...prev, { ...(result.data as ResourceCompanyData), contacts: [] }]);
          setOpenCompanies((prev) => new Set([...prev, (result.data as ResourceCompanyData).id]));
        }
        toast.success("Company added");
      }
      setShowCompanyDialog(false);
      router.refresh();
    } catch {
      toast.error("Failed to save company");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteCompany() {
    if (!deletingCompany) return;
    setIsSaving(true);
    try {
      const result = await deleteResourceCompany(deletingCompany.id);
      if (result.error) { toast.error(result.error); return; }
      setCompanies((prev) => prev.filter((c) => c.id !== deletingCompany.id));
      toast.success("Company deleted");
      setDeletingCompany(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete company");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Contact CRUD ──

  function openCreateContact(companyId: string) {
    setContactForm({ name: "", role: "", phone: "", email: "", notes: "" });
    setEditingContact(null);
    setContactCompanyId(companyId);
    setShowContactDialog(true);
  }

  function openEditContact(contact: ResourceContactData, companyId: string) {
    setContactForm({
      name: contact.name,
      role: contact.role || "",
      phone: contact.phone || "",
      email: contact.email || "",
      notes: contact.notes || "",
    });
    setEditingContact(contact);
    setContactCompanyId(companyId);
    setShowContactDialog(true);
  }

  async function handleSaveContact() {
    if (!contactForm.name.trim()) {
      toast.error("Contact name is required");
      return;
    }
    setIsSaving(true);
    try {
      if (editingContact) {
        const result = await updateResourceContact(editingContact.id, contactForm);
        if (result.error) { toast.error(result.error); return; }
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === contactCompanyId
              ? {
                  ...c,
                  contacts: c.contacts.map((ct) =>
                    ct.id === editingContact.id
                      ? { ...ct, ...contactForm, role: contactForm.role || null, phone: contactForm.phone || null, email: contactForm.email || null, notes: contactForm.notes || null }
                      : ct
                  ),
                }
              : c
          )
        );
        toast.success("Contact updated");
      } else {
        const result = await createResourceContact({ companyId: contactCompanyId, ...contactForm });
        if (result.error) { toast.error(result.error); return; }
        if (result.data) {
          setCompanies((prev) =>
            prev.map((c) =>
              c.id === contactCompanyId
                ? { ...c, contacts: [...c.contacts, result.data as ResourceContactData] }
                : c
            )
          );
        }
        toast.success("Contact added");
      }
      setShowContactDialog(false);
      router.refresh();
    } catch {
      toast.error("Failed to save contact");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteContact() {
    if (!deletingContact) return;
    setIsSaving(true);
    try {
      const result = await deleteResourceContact(deletingContact.contact.id);
      if (result.error) { toast.error(result.error); return; }
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === deletingContact.companyId
            ? { ...c, contacts: c.contacts.filter((ct) => ct.id !== deletingContact.contact.id) }
            : c
        )
      );
      toast.success("Contact deleted");
      setDeletingContact(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete contact");
    } finally {
      setIsSaving(false);
    }
  }

  const totalContacts = companies.reduce((sum, c) => sum + c.contacts.length, 0);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Contact className="w-5 h-5" />
                Resource Contacts
              </CardTitle>
              <CardDescription>
                Suppliers, subcontractors, adjusters, and other business contacts that Josh AI can reach out to on your behalf
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1.5" onClick={openCreateCompany}>
              <Plus className="w-4 h-4" />
              Add Company
            </Button>
          </div>
          {companies.length > 0 && (
            <div className="flex gap-3 text-xs text-muted-foreground pt-1">
              <span>{companies.length} {companies.length === 1 ? "company" : "companies"}</span>
              <span>{totalContacts} {totalContacts === 1 ? "contact" : "contacts"}</span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No resource companies yet.</p>
              <p className="text-xs mt-1">Add suppliers, subs, and adjusters so Josh AI can contact them for you.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {companies.map((company) => (
                <Collapsible
                  key={company.id}
                  open={openCompanies.has(company.id)}
                  onOpenChange={() => toggleCompany(company.id)}
                >
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left">
                      <div className="flex items-center gap-3 min-w-0">
                        <ChevronDown
                          className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${
                            openCompanies.has(company.id) ? "" : "-rotate-90"
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{company.name}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {company.type}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {company.contacts.length} {company.contacts.length === 1 ? "person" : "people"}
                            </Badge>
                          </div>
                          {(company.phone || company.email) && (
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              {company.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {company.phone}
                                </span>
                              )}
                              {company.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {company.email}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCompany(company)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeletingCompany(company)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="border-t px-4 py-3 bg-muted/20 space-y-2">
                        {company.contacts.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2">No contacts yet</p>
                        ) : (
                          company.contacts.map((contact) => (
                            <div
                              key={contact.id}
                              className="flex items-center justify-between py-2 px-3 rounded-md bg-background border group"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{contact.name}</span>
                                  {contact.role && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Briefcase className="w-3 h-3" />
                                      {contact.role}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                  {contact.phone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="w-3 h-3" />
                                      {contact.phone}
                                    </span>
                                  )}
                                  {contact.email && (
                                    <span className="flex items-center gap-1">
                                      <Mail className="w-3 h-3" />
                                      {contact.email}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditContact(contact, company.id)}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeletingContact({ contact, companyId: company.id })}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5 mt-1"
                          onClick={() => openCreateContact(company.id)}
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Add Contact at {company.name}
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Company dialog */}
      <Dialog open={showCompanyDialog} onOpenChange={setShowCompanyDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Edit Company" : "Add Company"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Wolverine Roofing Supply"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={companyForm.type} onValueChange={(v) => setCompanyForm((p) => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPANY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={companyForm.phone}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={companyForm.email}
                  onChange={(e) => setCompanyForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="info@company.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={companyForm.address}
                onChange={(e) => setCompanyForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="123 Main St, City, ST"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={companyForm.notes}
                onChange={(e) => setCompanyForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Any relevant details..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompanyDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveCompany} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingCompany ? "Save" : "Add Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={contactForm.name}
                  onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="John Smith"
                />
              </div>
              <div className="space-y-2">
                <Label>Role / Title</Label>
                <Input
                  value={contactForm.role}
                  onChange={(e) => setContactForm((p) => ({ ...p, role: e.target.value }))}
                  placeholder="Sales Rep, Estimator, etc."
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={contactForm.phone}
                  onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={contactForm.email}
                  onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="john@company.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={contactForm.notes}
                onChange={(e) => setContactForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Josh will see these notes when reaching out..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContactDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveContact} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingContact ? "Save" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete company confirmation */}
      <AlertDialog open={!!deletingCompany} onOpenChange={(open) => !open && setDeletingCompany(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deletingCompany?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the company and all {deletingCompany?.contacts.length || 0} contact(s) within it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCompany} disabled={isSaving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete contact confirmation */}
      <AlertDialog open={!!deletingContact} onOpenChange={(open) => !open && setDeletingContact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deletingContact?.contact.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This contact will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteContact} disabled={isSaving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
