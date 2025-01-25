import { Button } from '@/components/ui/button';
import { UserIcon } from 'lucide-react';
import Link from 'next/link';

const UserButton = () => {
  return (
    <Button asChild>
      <Link href='/sign-in'>
        <UserIcon /> Sign In
      </Link>
    </Button>
  );
};

export default UserButton;
