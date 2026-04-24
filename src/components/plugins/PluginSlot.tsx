import { memo, useEffect, useState } from '../../lib/teact/teact';

import type { SlotClickContext, SlotId } from '../../plugins/types';
import { getContributions, subscribeToSlot } from '../../plugins/slotRegistry';
import type { RegisteredContribution } from '../../plugins/slotRegistry';

import Button from '../ui/Button';
import Icon from '../common/icons/Icon';
import MenuItem from '../ui/MenuItem';

type OwnProps = {
  slotId: SlotId;
  variant: 'button' | 'menu-item';
  context?: SlotClickContext;
  className?: string;
};

const PluginSlot = ({ slotId, variant, context, className }: OwnProps) => {
  const [contributions, setContributions] = useState<RegisteredContribution[]>(() => getContributions(slotId));

  useEffect(() => {
    setContributions(getContributions(slotId));
    return subscribeToSlot(slotId, () => {
      setContributions(getContributions(slotId));
    });
  }, [slotId]);

  if (!contributions.length) return undefined;

  if (variant === 'button') {
    return (
      <>
        {contributions.map(({ contribution, onClick }) => (
          <Button
            key={`${contribution.id}`}
            round
            faded
            className={className}
            color="translucent"
            onClick={() => onClick(context)}
            ariaLabel={contribution.label}
          >
            {contribution.icon && <Icon name={contribution.icon as never} />}
          </Button>
        ))}
      </>
    );
  }

  return (
    <>
      {contributions.map(({ contribution, onClick }) => (
        <MenuItem
          key={contribution.id}
          icon={contribution.icon as never}
          onClick={() => onClick(context)}
        >
          {contribution.label}
        </MenuItem>
      ))}
    </>
  );
};

export default memo(PluginSlot);
