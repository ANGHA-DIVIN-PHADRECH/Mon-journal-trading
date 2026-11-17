"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ManualTradeEntry } from "./manual-trade-entry";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

export function AddTradeDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          Ajouter un trade
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ajouter un trade</DialogTitle>
          <DialogDescription>
            Choisissez un compte et saisissez vos achats et ventes. Enregistrez uniquement une
            entrée pour une position ouverte, ou ajoutez la sortie pour consigner un trade clôturé.
          </DialogDescription>
        </DialogHeader>
        <ManualTradeEntry
          onSaved={() => {
            setOpen(false);
            onSaved();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
