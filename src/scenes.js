// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// The four everyday gestures of Grocy, so a button, a voice command or a
// presence can do them: consume a product ("the last yogurt is eaten"), put
// something on the shopping list, mark a chore as done ("the vacuum ran" →
// the vacuuming chore is tracked), mark a battery as charged. Each one is
// undone from the Grocy interface (journals, shopping list): nothing is
// deleted.
//
// Names are typed by the scene author (Gladys offers no dynamic list of
// Grocy's products or chores): matched without case or accents, and a part of
// a name is enough when only one name contains it. Gladys applies the field
// defaults to scene actions.
// -----------------------------------------------------------------------------

const yes = (value) => value === true || value === 'true' || value === 1 || value === '1';

export const SCENE_ACTIONS = {
  async consume_product(hub, { fields = {} }) {
    return hub.consumeProduct(fields.product, fields.amount, { spoiled: yes(fields.spoiled) });
  },

  async add_to_shopping_list(hub, { fields = {} }) {
    return hub.addToShoppingList(fields.item, fields.amount, fields.note);
  },

  async execute_chore(hub, { fields = {} }) {
    return hub.executeChore({ name: fields.chore });
  },

  async charge_battery(hub, { fields = {} }) {
    return hub.chargeBattery({ name: fields.battery });
  },
};
