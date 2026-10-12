import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { TeammatesScreen } from "./client/screen";

function TeammatesItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Users"
      active={currentScreen?.screenId === "teammates"}
      onPress={() => openScreen({ screenId: "teammates" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "teammates", title: "Teammates", Component: TeammatesScreen });
  client.addSidebarHeaderItem({ id: "teammates", title: "Teammates", Component: TeammatesItem });
  return () => {};
}
