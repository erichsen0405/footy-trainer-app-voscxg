
/* eslint-disable */

// @eslint-ignore-file
// @ts-nocheck
import { cloneElement, PropsWithChildren, useContext } from "react";
import { EditableContext } from "./withEditableWrapper_";
import { Platform } from "react-native";

export type ElementTypes = "Text" | "View";

const isPrimitive = (item: any) => {
  if (Array.isArray(item)) return item.every((el) => isPrimitive(el));
  if (typeof item === "object")
    Object.values(item).every((el) => isPrimitive(el));
  if (typeof item === "string") return true;
  if (typeof item === "number") return true;

  return false;
};

export const getType = (el: any): ElementTypes | undefined => {
  if (el?.type?.render?.displayName === "Text") return "Text";
  if (el?.type?.render?.displayName === "View") return "View";
  if (el?.type?.name === "Icon") return "Icon";
  if (el?.type?.type?.displayName === "TouchableOpacity")
    return "TouchableOpacity";

  return undefined;
};

const toArray = <T,>(object: T | T[]): T[] => {
  if (Array.isArray(object)) return object;
  return [object];
};

export default function EditableElement_(_props: PropsWithChildren<any>) {
  const { children } = _props;

  // Early validation: if children is undefined or null, return null
  if (!children) {
    console.warn('EditableElement_: children is undefined or null');
    return null;
  }

  // Validate that children has props
  if (!children.props) {
    console.warn('EditableElement_: children does not have props property');
    return children;
  }

  const { props } = children;

  // If we are not running in the web the windows will causes
  // issues hence editable mode is not enabled.
  // IMPORTANT: Return early BEFORE calling any hooks
  if (Platform.OS !== "web") {
    return cloneElement(children, props);
  }

  // Only call useContext when we're on web platform
  const {
    editModeEnabled,
    selected,
    onElementClick,
    attributes: overwrittenProps,
    hovered,
    pushHovered,
    popHovered,
  } = useContext(EditableContext);

  const type = getType(children);
  const __sourceLocation = props.__sourceLocation;
  const __trace = props.__trace;

  // Validate __trace exists before using it
  if (!__trace) {
    console.warn('EditableElement_: __trace is undefined');
    return cloneElement(children, props);
  }

  const id = __trace.join("");
  const attributes = overwrittenProps[id] ?? {};

  const editStyling =
    selected === id
      ? {
          outline: "1px solid blue",
        }
      : hovered === id
      ? {
          outline: "1px dashed blue",
        }
      : {};

  const onClick = (ev: any) => {
    ev.stopPropagation();
    ev.preventDefault();
    onElementClick({
      sourceLocation: __sourceLocation,
      id,
      type,
      trace: __trace,
      props: {
        style: { ...props.style },
        children: isPrimitive(props.children) ? props.children : undefined,
      },
    });
  };

  const editProps = {
    onMouseOver: () => pushHovered(id),
    onMouseLeave: () => popHovered(id),
    onClick: (ev) => onClick(ev),
    onPress: (ev) => onClick(ev),
  };

  if (type === "Text") {
    if (!editModeEnabled) return children;

    return cloneElement(children, {
      ...editProps,
      ...props,
      style: [...toArray(props.style), editStyling, attributes.style ?? {}],
      children: attributes.children ?? children.props.children,
    });
  }

  if (type === "View") {
    if (!editModeEnabled) return children;

    return cloneElement(children, {
      ...props,
      ...editProps,
      style: [...toArray(props.style), editStyling, attributes.style ?? {}],
      children: children.props.children,
    });
  }

  if (type === "TouchableOpacity") {
    if (!editModeEnabled) return children;

    return cloneElement(children, {
      ...props,
      ...editProps,
      style: [...toArray(props.style), editStyling, attributes.style ?? {}],
      children: children.props.children,
    });
  }

  if (type === "Icon") {
    if (!editModeEnabled) return children;

    return cloneElement(children, {
      ...props,
      ...editProps,
      style: [...toArray(props.style), editStyling, attributes.style ?? {}],
      children: children.props.children,
    });
  }

  return children;
}
