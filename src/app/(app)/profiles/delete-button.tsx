import { deleteProfileAction } from './actions';

export function DeleteButton({ id }: { id: number }) {
  return (
    <form action={deleteProfileAction}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-red-600 hover:text-red-800 text-sm">
        Delete
      </button>
    </form>
  );
}
