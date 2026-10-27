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
import { useLeaveRequest } from "../state/unsaved.ts";

export function UnsavedChangesDialog() {
  const { open, answer } = useLeaveRequest();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          answer(false);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Descartar alterações não salvas?</AlertDialogTitle>
          <AlertDialogDescription>
            Há edições que ainda não foram salvas. Se continuar, elas se perdem.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => answer(true)}>
            Descartar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
